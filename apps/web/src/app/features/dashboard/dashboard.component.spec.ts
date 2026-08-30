import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Fridge, FridgeItem, Position, Wallet } from 'dindin-models';
import { DashboardComponent } from './dashboard.component';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { DividendService } from '../../core/services/dividend.service';
import { AuthService } from '../../core/services/auth.service';
import { HealthService } from '../../core/services/health.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let walletServiceMock: jasmine.SpyObj<WalletService>;
  let positionServiceMock: jasmine.SpyObj<PositionService>;
  let fridgeServiceMock: jasmine.SpyObj<FridgeService>;
  let dividendServiceMock: jasmine.SpyObj<DividendService>;
  let authServiceMock: { isAdmin: jasmine.Spy };
  let healthServiceMock: jasmine.SpyObj<HealthService>;

  const wallet = (id: string): Wallet => ({
    id,
    ownerId: 'user-1',
    name: `Carteira ${id}`,
    currency: 'BRL',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });

  const position = (overrides: Partial<Position>): Position => ({
    id: 'pos-1',
    walletId: 'wallet-1',
    ticker: 'HGLG11',
    assetType: 'FII',
    quantity: 10,
    averagePrice: 100,
    inFridge: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  const fridge = (id: string): Fridge => ({
    id,
    ownerId: 'user-1',
    name: `Geladeira ${id}`,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });

  const fridgeItem = (overrides: Partial<FridgeItem>): FridgeItem => ({
    id: 'item-1',
    fridgeId: 'fridge-1',
    ticker: 'MXRF11',
    quantity: 100,
    transferredPrice: 10,
    targetPrice: 12,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    walletServiceMock = jasmine.createSpyObj('WalletService', ['list']);
    positionServiceMock = jasmine.createSpyObj('PositionService', ['list']);
    fridgeServiceMock = jasmine.createSpyObj('FridgeService', [
      'listFridges',
      'listItems',
    ]);
    dividendServiceMock = jasmine.createSpyObj('DividendService', [
      'getMonthlyIncome',
    ]);
    authServiceMock = { isAdmin: jasmine.createSpy('isAdmin') };
    healthServiceMock = jasmine.createSpyObj('HealthService', ['check']);

    walletServiceMock.list.and.returnValue(of([]));
    positionServiceMock.list.and.returnValue(of([]));
    fridgeServiceMock.listFridges.and.returnValue(of([]));
    fridgeServiceMock.listItems.and.returnValue(of([]));
    dividendServiceMock.getMonthlyIncome.and.returnValue(
      of({ byTicker: [], total: 0, totalFromFridge: 0 }),
    );
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: WalletService, useValue: walletServiceMock },
        { provide: PositionService, useValue: positionServiceMock },
        { provide: FridgeService, useValue: fridgeServiceMock },
        { provide: DividendService, useValue: dividendServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: HealthService, useValue: healthServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
  });

  it('deve somar o total da carteira usando preço atual quando disponível', () => {
    walletServiceMock.list.and.returnValue(of([wallet('w1'), wallet('w2')]));
    positionServiceMock.list.and.callFake((walletId: string) =>
      of(
        walletId === 'w1'
          ? [position({ quantity: 10, averagePrice: 100, currentPrice: 110 })]
          : [position({ id: 'pos-2', quantity: 5, averagePrice: 20 })],
      ),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.totalWallet()).toBe(1200);
  });

  it('deve somar o total da geladeira usando preço de transferência como fallback', () => {
    fridgeServiceMock.listFridges.and.returnValue(
      of([fridge('f1'), fridge('f2')]),
    );
    fridgeServiceMock.listItems.and.callFake((fridgeId: string) =>
      of(
        fridgeId === 'f1'
          ? [fridgeItem({ quantity: 100, transferredPrice: 10 })]
          : [
              fridgeItem({
                id: 'item-2',
                quantity: 10,
                transferredPrice: 10,
                currentPrice: 9,
              }),
            ],
      ),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.totalFridge()).toBe(1090);
  });

  it('deve exibir os proventos do mês da mesma fonte da carteira', () => {
    walletServiceMock.list.and.returnValue(of([wallet('w1')]));
    dividendServiceMock.getMonthlyIncome.and.returnValue(
      of({ byTicker: [], total: 432.1, totalFromFridge: 0 }),
    );

    fixture.detectChanges();

    expect(dividendServiceMock.getMonthlyIncome).toHaveBeenCalledWith('w1');
    expect(fixture.componentInstance.totalDividends()).toBe(432.1);
    expect(
      fixture.nativeElement.querySelector('[data-testid="card-dividends"]')
        .textContent,
    ).toContain('432,10');
  });

  it('deve somar proventos de várias carteiras contando a geladeira uma única vez', () => {
    walletServiceMock.list.and.returnValue(of([wallet('w1'), wallet('w2')]));
    dividendServiceMock.getMonthlyIncome.and.callFake((walletId: string) =>
      of(
        walletId === 'w1'
          ? { byTicker: [], total: 130, totalFromFridge: 30 }
          : { byTicker: [], total: 80, totalFromFridge: 30 },
      ),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.totalDividends()).toBe(180);
  });

  it('deve exibir proventos zerados quando não há carteiras', () => {
    walletServiceMock.list.and.returnValue(of([]));

    fixture.detectChanges();

    expect(dividendServiceMock.getMonthlyIncome).not.toHaveBeenCalled();
    expect(fixture.componentInstance.totalDividends()).toBe(0);
  });

  it('deve exibir os três cards de resumo', () => {
    fixture.detectChanges();

    const element = fixture.nativeElement;
    expect(element.querySelector('[data-testid="card-wallet"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="card-fridge"]')).toBeTruthy();
    expect(
      element.querySelector('[data-testid="card-dividends"]'),
    ).toBeTruthy();
  });

  it('deve exibir mensagem de erro quando falhar ao carregar o resumo', () => {
    walletServiceMock.list.and.returnValue(
      throwError(() => new Error('network error')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(
      'Erro ao carregar resumo do dashboard.',
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="error-message"]'),
    ).toBeTruthy();
  });

  it('não deve exibir valores quando o resumo falha', () => {
    walletServiceMock.list.and.returnValue(
      throwError(() => new Error('network error')),
    );

    fixture.detectChanges();

    const element = fixture.nativeElement;
    expect(
      element.querySelector('[data-testid="wallet-value"]').textContent.trim(),
    ).toBe('—');
    expect(
      element.querySelector('[data-testid="fridge-value"]').textContent.trim(),
    ).toBe('—');
    expect(
      element
        .querySelector('[data-testid="dividends-value"]')
        .textContent.trim(),
    ).toBe('—');
  });

  it('deve indicar backend indisponível quando o health check falha', () => {
    healthServiceMock.check.and.returnValue(
      throwError(() => new Error('network error')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.backendOnline()).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('[data-testid="backend-status"]')
        .textContent,
    ).toContain('Backend indisponível');
  });

  it('deve exibir link admin apenas quando usuário é admin', fakeAsync(() => {
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="admin-link"]'),
    ).toBeTruthy();
  }));

  it('não deve exibir link admin quando usuário não é admin', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="admin-link"]'),
    ).toBeFalsy();
  }));
});
