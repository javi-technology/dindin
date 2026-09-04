import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  RecommendedWallet,
  RecommendedWalletComparison,
  Wallet,
} from 'dindin-models';
import { RecommendedWalletComponent } from './recommended-wallet.component';
import { RecommendedWalletService } from '../../core/services/recommended-wallet.service';
import { WalletService } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';

describe('RecommendedWalletComponent', () => {
  let fixture: ComponentFixture<RecommendedWalletComponent>;
  let serviceMock: jasmine.SpyObj<RecommendedWalletService>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let authServiceMock: { isAdmin: jasmine.Spy };

  const wallet: RecommendedWallet = {
    id: 'bb-fii_2026-09',
    provider: 'BB',
    month: '2026-09',
    revision: 2,
    publishedAt: '2026-09-02',
    sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
    status: 'pending_review',
    renda: [
      {
        ticker: 'HGLG11',
        segment: 'Logísticos',
        weight: 0.125,
        closePrice: 100,
        ifixWeight: 0.04,
        inCatalog: true,
      },
    ],
    ganho: [],
    parsedAt: '2026-09-04T00:00:00Z',
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
  };
  const userWallet: Wallet = {
    id: 'wallet-1',
    ownerId: 'user-1',
    name: 'Principal',
    currency: 'BRL',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const comparison: RecommendedWalletComparison = {
    recommended: wallet,
    items: [
      {
        ticker: 'HGLG11',
        recommendedWeight: 0.125,
        currentWeight: 0.1,
        quantity: 2,
        currentValue: 200,
        status: 'match',
      },
    ],
    totalValue: 200,
  };

  beforeEach(async () => {
    serviceMock = jasmine.createSpyObj('RecommendedWalletService', [
      'list',
      'compare',
      'confirm',
      'import',
    ]);
    walletServiceMock = jasmine.createSpyObj('WalletService', ['list']);
    authServiceMock = { isAdmin: jasmine.createSpy('isAdmin') };

    serviceMock.list.and.returnValue(of([wallet]));
    serviceMock.compare.and.returnValue(of(comparison));
    serviceMock.confirm.and.returnValue(of({ ...wallet, status: 'confirmed' }));
    serviceMock.import.and.returnValue(of(wallet));
    walletServiceMock.list.and.returnValue(of([userWallet]));
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [RecommendedWalletComponent],
      providers: [
        provideRouter([]),
        { provide: RecommendedWalletService, useValue: serviceMock },
        { provide: WalletService, useValue: walletServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecommendedWalletComponent);
  });

  it('deve carregar a carteira mais recente e selecionar a primeira carteira do usuário', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedMonth()).toBe('2026-09');
    expect(fixture.componentInstance.selectedWalletId()).toBe('wallet-1');
    expect(serviceMock.compare).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'renda',
    );
  });

  it('deve comparar novamente ao trocar para ganho de capital', () => {
    fixture.detectChanges();

    fixture.componentInstance.selectTab('ganho');

    expect(serviceMock.compare).toHaveBeenCalledWith(
      'wallet-1',
      '2026-09',
      'ganho',
    );
  });

  it('deve confirmar usando o modal customizado', () => {
    fixture.detectChanges();

    fixture.componentInstance.openConfirmModal();
    expect(fixture.componentInstance.confirmModalOpen()).toBeTrue();
    fixture.componentInstance.confirmWallet();

    expect(serviceMock.confirm).toHaveBeenCalledWith(wallet.id);
    expect(fixture.componentInstance.confirmModalOpen()).toBeFalse();
    expect(fixture.componentInstance.recommendedWallet()?.status).toBe(
      'confirmed',
    );
  });

  it('deve rejeitar arquivo que não tenha nome de carteira BB', () => {
    fixture.detectChanges();
    const file = new File(['pdf'], 'outro.pdf', { type: 'application/pdf' });

    fixture.componentInstance.onFileSelected({
      target: { files: [file] },
    } as unknown as Event);

    expect(serviceMock.import).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe(
      'O nome do arquivo deve começar com CartFII_.',
    );
  });

  it('deve exibir erro quando falhar ao carregar carteiras recomendadas', () => {
    serviceMock.list.and.returnValue(
      throwError(() => new Error('falha de rede')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(
      'Erro ao carregar carteiras recomendadas.',
    );
  });
});
