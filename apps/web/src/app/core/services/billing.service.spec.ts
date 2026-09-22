import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { MeResponse } from 'dindin-shared-types';
import { BillingService } from './billing.service';
import { AuthService } from './auth.service';

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;
  let user$: Subject<{ uid: string } | null>;

  const me: MeResponse = {
    uid: 'user-1',
    admin: false,
    subscription: {
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
    },
    entitlements: ['ai', 'projections'],
  };

  beforeEach(() => {
    user$ = new Subject<{ uid: string } | null>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user$ } },
      ],
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve carregar /api/me e atualizar os signals', () => {
    service.loadMe().subscribe((result) => expect(result).toEqual(me));

    const request = httpMock.expectOne('/api/me');
    expect(request.request.method).toBe('GET');
    request.flush(me);

    expect(service.loaded()).toBe(true);
    expect(service.subscription().status).toBe('active');
    expect(service.entitlements()).toEqual(['ai', 'projections']);
    expect(service.hasAi()).toBe(true);
    expect(service.hasProjections()).toBe(true);
  });

  it('deve expor valores padrão antes de carregar', () => {
    expect(service.loaded()).toBe(false);
    expect(service.subscription()).toEqual({
      status: 'none',
      plan: null,
      interval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(service.entitlements()).toEqual([]);
    expect(service.hasAi()).toBe(false);
    expect(service.hasProjections()).toBe(false);
  });

  it('não deve considerar assinante antes de carregar', () => {
    expect(service.isSubscriber()).toBe(false);
  });

  (
    [
      ['active', true],
      ['trialing', true],
      ['past_due', true],
      ['canceled', false],
      ['none', false],
    ] as const
  ).forEach(([status, expected]) => {
    it(`deve indicar assinante=${expected} para status ${status}`, () => {
      service.loadMe().subscribe();
      httpMock
        .expectOne('/api/me')
        .flush({ ...me, subscription: { ...me.subscription, status } });

      expect(service.isSubscriber()).toBe(expected);
    });
  });

  it('não deve considerar assinante o admin sem assinatura', () => {
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush({
      ...me,
      admin: true,
      subscription: { ...me.subscription, status: 'none' },
      entitlements: ['ai', 'projections'],
    });

    expect(service.isSubscriber()).toBe(false);
  });

  it('deve iniciar checkout e redirecionar para a url retornada', () => {
    vi.spyOn(service, 'redirectTo').mockImplementation(() => {});

    service.startCheckout('year').subscribe();

    const request = httpMock.expectOne('/api/billing/checkout-session');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ interval: 'year' });
    request.flush({ url: 'https://checkout.example.com' });

    expect(service.redirectTo).toHaveBeenCalledWith(
      'https://checkout.example.com',
    );
  });

  it('deve abrir o portal e redirecionar para a url retornada', () => {
    vi.spyOn(service, 'redirectTo').mockImplementation(() => {});

    service.openPortal().subscribe();

    const request = httpMock.expectOne('/api/billing/portal-session');
    expect(request.request.method).toBe('POST');
    request.flush({ url: 'https://portal.example.com' });

    expect(service.redirectTo).toHaveBeenCalledWith(
      'https://portal.example.com',
    );
  });

  it('deve marcar assinatura exigida e remover os entitlements', () => {
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    service.markSubscriptionRequired();

    expect(service.subscriptionRequired()).toBe(true);
    expect(service.entitlements()).toEqual([]);
    expect(service.hasAi()).toBe(false);
    expect(service.hasProjections()).toBe(false);
  });

  it('deve limpar a flag ao recarregar /api/me', () => {
    service.markSubscriptionRequired();
    expect(service.subscriptionRequired()).toBe(true);

    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    expect(service.subscriptionRequired()).toBe(false);
  });

  it('deve limpar o estado quando o usuário mudar', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);
    expect(service.loaded()).toBe(true);

    user$.next({ uid: 'user-2' });

    expect(service.loaded()).toBe(false);
    expect(service.subscription().status).toBe('none');
    expect(service.entitlements()).toEqual([]);
  });

  it('não deve limpar o estado quando o mesmo usuário reemitir', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    user$.next({ uid: 'user-1' });

    expect(service.loaded()).toBe(true);
    expect(service.hasAi()).toBe(true);
  });

  it('deve limpar o estado ao deslogar', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);
    service.markSubscriptionRequired();

    user$.next(null);

    expect(service.loaded()).toBe(false);
    expect(service.subscription().status).toBe('none');
    expect(service.subscriptionRequired()).toBe(false);
  });

  it('deve encerrar a assinatura de user$ ao destruir o injector', () => {
    expect(user$.observed).toBe(true);

    httpMock.verify();
    TestBed.resetTestingModule();

    expect(user$.observed).toBe(false);
  });
});
