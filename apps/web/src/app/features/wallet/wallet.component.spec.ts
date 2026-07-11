import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of } from 'rxjs';
import { WalletComponent } from './wallet.component';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { Wallet, Position } from 'dindin-models';

describe('WalletComponent', () => {
  let fixture: ComponentFixture<WalletComponent>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;

  const wallets: Wallet[] = [
    {
      id: 'wallet-1',
      ownerId: 'user-123',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const positions: Position[] = [
    {
      id: 'position-1',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 110.5,
      currentPrice: 112,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'position-2',
      walletId: 'wallet-1',
      ticker: 'KNRI11',
      assetType: 'FII',
      quantity: 5,
      averagePrice: 130,
      currentPrice: 132,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    walletServiceMock = jasmine.createSpyObj('WalletService', [
      'list',
      'create',
    ]);
    positionServiceMock = jasmine.createSpyObj('PositionService', [
      'list',
      'create',
      'update',
      'delete',
    ]);

    walletServiceMock.list.and.returnValue(of(wallets));
    positionServiceMock.list.and.returnValue(of(positions));
    spyOn(window, 'confirm').and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [WalletComponent],
      providers: [
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('deve listar carteiras e selecionar a primeira', () => {
    expect(walletServiceMock.list).toHaveBeenCalled();
    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
  });

  it('deve exibir botão para criar carteira quando não houver carteiras', async () => {
    walletServiceMock.list.and.returnValue(of([]));
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-carteira"]',
    );
    expect(createButton).toBeTruthy();
  });

  it('deve criar carteira padrão ao clicar no botão', fakeAsync(() => {
    walletServiceMock.list.and.returnValue(of([]));
    walletServiceMock.create.and.returnValue(of(wallets[0]));
    fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButton = compiled.querySelector(
      '[data-testid="btn-criar-carteira"]',
    ) as HTMLButtonElement;
    createButton.click();
    tick();
    fixture.detectChanges();

    expect(walletServiceMock.create).toHaveBeenCalledWith({
      name: 'Carteira Principal',
      currency: 'BRL',
    });
    expect(positionServiceMock.list).toHaveBeenCalledWith('wallet-1');
  }));

  it('deve renderizar tabela com ticker, quantidade, valor unitário e total', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent;
    expect(firstRow).toContain('HGLG11');
    expect(firstRow).toContain('10');
    expect(firstRow).toMatch(/R\$\s?110,50/);
    expect(firstRow).toMatch(/R\$\s?1\.105,00/);
  });

  it('deve calcular e exibir o total geral', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const totalElement = compiled.querySelector('[data-testid="total-geral"]');
    expect(totalElement?.textContent).toMatch(/R\$\s?1\.755,00/);
  });

  it('deve abrir formulário ao clicar em adicionar posição', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const addButton = compiled.querySelector(
      '[data-testid="btn-adicionar"]',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = compiled.querySelector('[data-testid="position-form"]');
    expect(form).toBeTruthy();
  });

  it('deve abrir formulário preenchido ao clicar em editar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = compiled.querySelector(
      '[data-testid="btn-editar-0"]',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();

    const tickerInput = compiled.querySelector(
      'input#ticker',
    ) as HTMLInputElement;
    expect(tickerInput.value).toBe('HGLG11');
  });

  it('deve chamar serviço de exclusão ao confirmar remoção', fakeAsync(() => {
    positionServiceMock.delete.and.returnValue(of(undefined));
    positionServiceMock.list.and.returnValue(of(positions.slice(1)));

    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '[data-testid="btn-remover-0"]',
    ) as HTMLButtonElement;
    deleteButton.click();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.delete).toHaveBeenCalledWith(
      'wallet-1',
      'position-1',
    );
  }));

  it('deve fazer parse de preço com vírgula decimal', fakeAsync(() => {
    const newPosition: Position = {
      id: 'position-3',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 1.55,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    positionServiceMock.create.and.returnValue(of(newPosition));
    positionServiceMock.list.and.returnValue(of([...positions, newPosition]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: '1,55',
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 1.55,
    });
  }));

  it('deve criar nova posição e recarregar lista', fakeAsync(() => {
    const newPosition: Position = {
      id: 'position-3',
      walletId: 'wallet-1',
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    positionServiceMock.create.and.returnValue(of(newPosition));
    positionServiceMock.list.and.returnValue(of([...positions, newPosition]));

    fixture.componentInstance.openForm();
    fixture.componentInstance.form.patchValue({
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
      currentPrice: 10,
    });
    fixture.componentInstance.savePosition();
    tick();
    fixture.detectChanges();

    expect(positionServiceMock.create).toHaveBeenCalledWith('wallet-1', {
      ticker: 'MXRF11',
      assetType: 'FII',
      quantity: 15,
      averagePrice: 9.8,
      currentPrice: 10,
    });
  }));
});
