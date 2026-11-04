import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  Fridge,
  FridgeItem,
  Position,
  RecommendedWallet,
  RecommendedWalletAsset,
  Wallet,
} from 'dindin-models';
import { FridgeService } from '../../../../core/services/fridge.service';
import { PositionService } from '../../../../core/services/position.service';
import { WalletService } from '../../../../core/services/wallet.service';
import { WalletChangesComponent } from './wallet-changes.component';

// ---------------------------------------------------------------------------
// Quadro "Entra e sai do mês" (issue #586)
//
// Mostra o que o BB publica e cruza com o que o usuário tem: fundo que sai e
// está em carteira pode ir para a geladeira; fundo que entra e está na
// geladeira pode ser descongelado. Sempre por decisão do usuário.
// ---------------------------------------------------------------------------

describe('WalletChangesComponent', () => {
  let fixture: ComponentFixture<WalletChangesComponent>;
  let positionMock: jasmine.SpyObj<PositionService>;
  let fridgeMock: jasmine.SpyObj<FridgeService>;
  let walletMock: jasmine.SpyObj<WalletService>;

  const ativo = (ticker: string) =>
    ({ ticker }) as unknown as RecommendedWalletAsset;

  const carteira = (
    changes?: RecommendedWallet['changes'],
  ): RecommendedWallet => ({
    id: 'bb-fii_2026-11',
    provider: 'BB',
    month: '2026-11',
    revision: 1,
    publishedAt: '2026-11-03',
    sourceFile: 'wallets/fii-bb/CartFII_Nov26.pdf',
    status: 'confirmed',
    renda: [ativo('KNCR11'), ativo('XPML11')],
    ganho: [ativo('XPLG11')],
    ...(changes ? { changes } : {}),
    parsedAt: '2026-11-03T00:00:00Z',
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
  });

  const novembro = carteira({
    renda: { entering: ['KNCR11'], leaving: ['RZTR11'] },
    ganho: { entering: [], leaving: [] },
  });

  const wallets = [
    { id: 'wallet-1', name: 'Principal' },
    { id: 'wallet-2', name: 'Reserva' },
  ] as Wallet[];

  const posicao = (ticker: string, walletId = 'wallet-1'): Position =>
    ({
      id: `pos-${ticker}`,
      walletId,
      ticker,
      assetType: 'FII',
      quantity: 10,
      averagePrice: 100,
      inFridge: false,
    }) as Position;

  const fridges = [{ id: 'fridge-1', name: 'Geladeira' }] as Fridge[];
  const itemKncr = {
    id: 'item-1',
    fridgeId: 'fridge-1',
    ticker: 'KNCR11',
    quantity: 7,
    transferredPrice: 100,
    targetPrice: 120,
  } as FridgeItem;

  function criar(wallet: RecommendedWallet, actionable = true): HTMLElement {
    fixture = TestBed.createComponent(WalletChangesComponent);
    fixture.componentRef.setInput('wallet', wallet);
    fixture.componentRef.setInput('actionable', actionable);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const testid = (root: HTMLElement, id: string) =>
    root.querySelector(`[data-testid="${id}"]`);

  beforeEach(async () => {
    positionMock = jasmine.createSpyObj('PositionService', [
      'list',
      'moveToFridge',
    ]);
    fridgeMock = jasmine.createSpyObj('FridgeService', [
      'listFridges',
      'listItems',
      'unfreezeItem',
    ]);
    walletMock = jasmine.createSpyObj('WalletService', ['list']);
    walletMock.list.and.returnValue(of(wallets));
    positionMock.list.and.returnValue(of([]));
    fridgeMock.listFridges.and.returnValue(of(fridges));
    fridgeMock.listItems.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [WalletChangesComponent],
      providers: [
        { provide: PositionService, useValue: positionMock },
        { provide: FridgeService, useValue: fridgeMock },
        { provide: WalletService, useValue: walletMock },
      ],
    }).compileComponents();
  });

  describe('os três estados', () => {
    it('deve mostrar o que entra e o que sai', () => {
      const root = criar(novembro);

      expect(testid(root, 'entering-KNCR11')?.textContent).toContain('KNCR11');
      expect(testid(root, 'leaving-RZTR11')?.textContent).toContain('RZTR11');
    });

    it('deve dizer "sem alterações" na carteira que não mudou', () => {
      const root = criar(novembro);

      expect(testid(root, 'changes-ganho-unchanged')).toBeTruthy();
      expect(testid(root, 'changes-ganho-unknown')).toBeNull();
    });

    it('deve dizer "não informado", e não "sem alterações", sem o dado', () => {
      const root = criar(carteira());

      expect(testid(root, 'changes-renda-unknown')).toBeTruthy();
      expect(testid(root, 'changes-ganho-unknown')).toBeTruthy();
      expect(testid(root, 'changes-renda-unchanged')).toBeNull();
    });

    it('não deve buscar as posições quando não há mudança a cruzar', () => {
      criar(carteira());

      expect(walletMock.list).not.toHaveBeenCalled();
    });
  });

  describe('fundo que sai', () => {
    it('deve indicar a quantidade e oferecer mover quando o usuário o possui', () => {
      positionMock.list.and.callFake((walletId: string) =>
        of(walletId === 'wallet-1' ? [posicao('RZTR11')] : []),
      );

      const root = criar(novembro);

      const linha = testid(root, 'leaving-RZTR11');
      expect(linha?.textContent).toContain('10 cotas');
      expect(linha?.textContent).toContain('Principal');
      expect(testid(root, 'btn-mover-pos-RZTR11')).toBeTruthy();
    });

    it('deve ser só informação quando o usuário não o possui', () => {
      const root = criar(novembro);

      expect(testid(root, 'leaving-RZTR11')).toBeTruthy();
      expect(testid(root, 'btn-mover-pos-RZTR11')).toBeNull();
    });

    it('não deve oferecer de novo a posição que já está na geladeira', () => {
      positionMock.list.and.returnValue(
        of([{ ...posicao('RZTR11'), inFridge: true }]),
      );

      const root = criar(novembro);

      expect(testid(root, 'btn-mover-pos-RZTR11')).toBeNull();
    });

    it('não deve ser candidato à geladeira quando continua na outra carteira', () => {
      positionMock.list.and.returnValue(of([posicao('XPLG11')]));

      const root = criar(
        carteira({
          renda: { entering: ['KNCR11'], leaving: ['XPLG11'] },
        }),
      );

      expect(testid(root, 'leaving-XPLG11')?.textContent).toContain(
        'Continua recomendado na Carteira Ganho',
      );
      expect(testid(root, 'btn-mover-pos-XPLG11')).toBeNull();
    });

    it('deve mover pelo fluxo existente e recarregar as posições', () => {
      positionMock.list.and.returnValue(of([posicao('RZTR11')]));
      positionMock.moveToFridge.and.returnValue(of(itemKncr));
      const root = criar(novembro);
      positionMock.list.calls.reset();

      (testid(root, 'btn-mover-pos-RZTR11') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(testid(root, 'mover-confirm-modal')).toBeTruthy();

      fixture.componentInstance.confirmMove({
        fridgeId: 'fridge-1',
        targetPrice: 120,
      });
      fixture.detectChanges();

      expect(positionMock.moveToFridge).toHaveBeenCalledWith(
        'wallet-1',
        'pos-RZTR11',
        { fridgeId: 'fridge-1', targetPrice: 120 },
      );
      expect(testid(root, 'mover-confirm-modal')).toBeNull();
      expect(positionMock.list).toHaveBeenCalled();
    });

    it('deve manter o modal aberto com o erro quando mover falha', () => {
      positionMock.list.and.returnValue(of([posicao('RZTR11')]));
      positionMock.moveToFridge.and.returnValue(
        throwError(() => new Error('falhou')),
      );
      const root = criar(novembro);

      (testid(root, 'btn-mover-pos-RZTR11') as HTMLButtonElement).click();
      fixture.detectChanges();
      fixture.componentInstance.confirmMove({
        fridgeId: 'fridge-1',
        targetPrice: 120,
      });
      fixture.detectChanges();

      expect(testid(root, 'mover-confirm-modal')).toBeTruthy();
      expect(fixture.componentInstance.actionError()).toContain('mover');
    });
  });

  describe('fundo que entra', () => {
    it('deve oferecer descongelar quando já está na geladeira', () => {
      fridgeMock.listItems.and.returnValue(of([itemKncr]));

      const root = criar(novembro);

      expect(testid(root, 'entering-KNCR11')?.textContent).toContain(
        '7 cotas na geladeira',
      );
      expect(testid(root, 'btn-descongelar-item-1')).toBeTruthy();
    });

    it('deve descongelar pelo fluxo existente e recarregar', () => {
      fridgeMock.listItems.and.returnValue(of([itemKncr]));
      fridgeMock.unfreezeItem.and.returnValue(of(posicao('KNCR11')));
      const root = criar(novembro);
      fridgeMock.listItems.calls.reset();

      (testid(root, 'btn-descongelar-item-1') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(testid(root, 'unfreeze-modal')).toBeTruthy();

      fixture.componentInstance.confirmUnfreeze('wallet-2');
      fixture.detectChanges();

      expect(fridgeMock.unfreezeItem).toHaveBeenCalledWith(
        'fridge-1',
        'item-1',
        'wallet-2',
      );
      expect(testid(root, 'unfreeze-modal')).toBeNull();
      expect(fridgeMock.listItems).toHaveBeenCalled();
    });
  });

  it('não deve oferecer ações em mês anterior, cuja recomendação pode ter mudado', () => {
    positionMock.list.and.returnValue(of([posicao('RZTR11')]));
    fridgeMock.listItems.and.returnValue(of([itemKncr]));

    const root = criar(novembro, false);

    expect(testid(root, 'leaving-RZTR11')).toBeTruthy();
    expect(testid(root, 'btn-mover-pos-RZTR11')).toBeNull();
    expect(testid(root, 'btn-descongelar-item-1')).toBeNull();
  });

  it('deve mostrar as mudanças e avisar quando não consegue ler as posições', () => {
    walletMock.list.and.returnValue(throwError(() => new Error('falhou')));

    const root = criar(novembro);

    expect(testid(root, 'leaving-RZTR11')).toBeTruthy();
    expect(testid(root, 'holdings-error')).toBeTruthy();
  });
});
