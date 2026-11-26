import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of, throwError } from 'rxjs';
import { BillingService } from '../services/billing.service';
import { billingGuard } from './billing.guard';

// A página de assinatura só existe com a cobrança ligada (issue #607).
describe('billingGuard', () => {
  let billingServiceMock: {
    loaded: ReturnType<typeof signal<boolean>>;
    billingEnabled: ReturnType<typeof signal<boolean>>;
    loadMe: any;
  };
  let routerMock: jasmine.SpyObj<Router>;
  const home = {} as UrlTree;

  const run = () =>
    TestBed.runInInjectionContext(() => billingGuard({} as never, {} as never));

  beforeEach(() => {
    billingServiceMock = {
      loaded: signal(true),
      billingEnabled: signal(true),
      loadMe: jasmine.createSpy('loadMe').and.returnValue(of({})),
    };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue(home);

    TestBed.configureTestingModule({
      providers: [
        { provide: BillingService, useValue: billingServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir o acesso com a cobrança ligada', async () => {
    expect(await run()).toBe(true);
    expect(routerMock.parseUrl).not.toHaveBeenCalled();
  });

  it('deve redirecionar para o dashboard com a cobrança desligada', async () => {
    billingServiceMock.billingEnabled.set(false);

    expect(await run()).toBe(home);
    expect(routerMock.parseUrl).toHaveBeenCalledWith('/');
  });

  it('deve carregar o /api/me antes de decidir', async () => {
    billingServiceMock.loaded.set(false);
    billingServiceMock.loadMe.and.callFake(() => {
      billingServiceMock.loaded.set(true);
      billingServiceMock.billingEnabled.set(false);
      return of({});
    });

    expect(await run()).toBe(home);
    expect(billingServiceMock.loadMe).toHaveBeenCalled();
  });

  it('não deve recarregar o /api/me já carregado', async () => {
    await run();

    expect(billingServiceMock.loadMe).not.toHaveBeenCalled();
  });

  // Sem saber o estado, vale a cobrança ligada, como no restante do web.
  it('deve permitir o acesso quando o /api/me falha', async () => {
    billingServiceMock.loaded.set(false);
    billingServiceMock.loadMe.and.returnValue(
      throwError(() => new Error('rede')),
    );

    expect(await run()).toBe(true);
  });
});
