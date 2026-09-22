import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PatrimonySnapshot } from 'dindin-models';
import type { DashboardSummaryResponse } from 'dindin-shared-types';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { HealthService } from '../../core/services/health.service';
import { PatrimonyService } from '../../core/services/patrimony.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardServiceMock: jasmine.SpyObj<DashboardService>;
  let authServiceMock: { isAdmin: any };
  let healthServiceMock: jasmine.SpyObj<HealthService>;
  let patrimonyServiceMock: jasmine.SpyObj<PatrimonyService>;

  const summary = (
    overrides: Partial<DashboardSummaryResponse> = {},
  ): DashboardSummaryResponse => ({
    totalWallet: 0,
    totalFridge: 0,
    total: 0,
    monthlyIncomeTotal: 0,
    composition: [],
    ...overrides,
  });

  const snapshot = (date: string, total: number): PatrimonySnapshot => ({
    id: date,
    userId: 'user-1',
    date,
    totalWallet: total,
    totalFridge: 0,
    total,
    createdAt: `${date}T00:00:00Z`,
  });

  beforeEach(async () => {
    dashboardServiceMock = jasmine.createSpyObj('DashboardService', [
      'getSummary',
    ]);
    authServiceMock = { isAdmin: jasmine.createSpy('isAdmin') };
    healthServiceMock = jasmine.createSpyObj('HealthService', ['check']);
    patrimonyServiceMock = jasmine.createSpyObj('PatrimonyService', [
      'recordSnapshot',
      'getHistory',
    ]);

    dashboardServiceMock.getSummary.and.returnValue(of(summary()));
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));
    healthServiceMock.check.and.returnValue(
      of({ status: 'ok', project: 'dindin' }),
    );
    patrimonyServiceMock.recordSnapshot.and.returnValue(
      of({} as PatrimonySnapshot),
    );
    patrimonyServiceMock.getHistory.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: dashboardServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: HealthService, useValue: healthServiceMock },
        { provide: PatrimonyService, useValue: patrimonyServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
  });

  // As somas de patrimônio, geladeira e renda passaram para a API (#300) e
  // são cobertas em `consolidated-income.spec`. Aqui só resta o consumo.
  it('deve exibir os totais vindos do resumo', () => {
    dashboardServiceMock.getSummary.and.returnValue(
      of(
        summary({
          totalWallet: 1200,
          totalFridge: 1090,
          total: 2290,
          monthlyIncomeTotal: 432.1,
        }),
      ),
    );

    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.totalWallet()).toBe(1200);
    expect(component.totalFridge()).toBe(1090);
    expect(component.totalDividends()).toBe(432.1);
    expect(
      fixture.nativeElement.querySelector('[data-testid="card-dividends"]')
        .textContent,
    ).toContain('432,10');
  });

  it('deve carregar o resumo numa única requisição', () => {
    fixture.detectChanges();

    expect(dashboardServiceMock.getSummary).toHaveBeenCalledTimes(1);
  });

  it('deve repassar a composição ao gráfico', () => {
    dashboardServiceMock.getSummary.and.returnValue(
      of(
        summary({
          totalWallet: 1400,
          composition: [
            { ticker: 'HGLG11', value: 1100 },
            { ticker: 'PETR4', value: 300 },
          ],
        }),
      ),
    );

    fixture.detectChanges();

    expect(
      fixture.componentInstance.composition().map((item) => item.ticker),
    ).toEqual(['HGLG11', 'PETR4']);
    expect(
      fixture.nativeElement.querySelector('app-composition-chart'),
    ).toBeTruthy();
  });

  it('não deve exibir o gráfico de composição quando o resumo falha', () => {
    dashboardServiceMock.getSummary.and.returnValue(
      throwError(() => new Error('falha')),
    );

    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('app-composition-chart'),
    ).toBeFalsy();
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
    dashboardServiceMock.getSummary.and.returnValue(
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
    dashboardServiceMock.getSummary.and.returnValue(
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

    expect(fixture.componentInstance.backendOnline()).toBe(false);
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

  it('deve exibir link admin de usuários quando usuário é admin', fakeAsync(() => {
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '[data-testid="admin-users-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/admin/users');
  }));

  it('não deve exibir link admin quando usuário não é admin', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="admin-link"]'),
    ).toBeFalsy();
  }));

  it('deve registrar snapshot e depois carregar o histórico', () => {
    const history = [snapshot('2026-08-27', 120)];
    const calls: string[] = [];
    patrimonyServiceMock.recordSnapshot.and.callFake(() => {
      calls.push('record');
      return of({} as PatrimonySnapshot);
    });
    patrimonyServiceMock.getHistory.and.callFake(() => {
      calls.push('history');
      return of(history);
    });

    fixture.detectChanges();

    expect(calls).toEqual(['record', 'history']);
    expect(fixture.componentInstance.patrimonyHistory()).toEqual(history);
  });

  it('deve exibir erro quando o histórico falhar', () => {
    patrimonyServiceMock.getHistory.and.returnValue(
      throwError(() => new Error('network error')),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.patrimonyError()).toBe(
      'Erro ao carregar evolução patrimonial.',
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="patrimony-error"]'),
    ).toBeTruthy();
  });

  it('deve carregar o histórico mesmo quando o registro falhar', () => {
    const history = [snapshot('2026-08-27', 120)];
    patrimonyServiceMock.recordSnapshot.and.returnValue(
      throwError(() => new Error('network error')),
    );
    patrimonyServiceMock.getHistory.and.returnValue(of(history));

    fixture.detectChanges();

    expect(patrimonyServiceMock.getHistory).toHaveBeenCalled();
    expect(fixture.componentInstance.patrimonyHistory()).toEqual(history);
  });
});
