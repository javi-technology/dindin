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
    entitlements: ['ai'],
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

    expect(service.loaded()).toBeTrue();
    expect(service.subscription().status).toBe('active');
    expect(service.entitlements()).toEqual(['ai']);
    expect(service.hasAi()).toBeTrue();
  });

  it('deve expor valores padrão antes de carregar', () => {
    expect(service.loaded()).toBeFalse();
    expect(service.subscription()).toEqual({
      status: 'none',
      plan: null,
      interval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(service.entitlements()).toEqual([]);
    expect(service.hasAi()).toBeFalse();
  });

  it('deve iniciar checkout e redirecionar para a url retornada', () => {
    spyOn(service, 'redirectTo');

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
    spyOn(service, 'redirectTo');

    service.openPortal().subscribe();

    const request = httpMock.expectOne('/api/billing/portal-session');
    expect(request.request.method).toBe('POST');
    request.flush({ url: 'https://portal.example.com' });

    expect(service.redirectTo).toHaveBeenCalledWith(
      'https://portal.example.com',
    );
  });

  it('deve marcar assinatura exigida e remover o entitlement de IA', () => {
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    service.markSubscriptionRequired();

    expect(service.subscriptionRequired()).toBeTrue();
    expect(service.entitlements()).toEqual([]);
    expect(service.hasAi()).toBeFalse();
  });

  it('deve limpar a flag ao recarregar /api/me', () => {
    service.markSubscriptionRequired();
    expect(service.subscriptionRequired()).toBeTrue();

    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    expect(service.subscriptionRequired()).toBeFalse();
  });

  it('deve limpar o estado quando o usuário mudar', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);
    expect(service.loaded()).toBeTrue();

    user$.next({ uid: 'user-2' });

    expect(service.loaded()).toBeFalse();
    expect(service.subscription().status).toBe('none');
    expect(service.entitlements()).toEqual([]);
  });

  it('não deve limpar o estado quando o mesmo usuário reemitir', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);

    user$.next({ uid: 'user-1' });

    expect(service.loaded()).toBeTrue();
    expect(service.hasAi()).toBeTrue();
  });

  it('deve limpar o estado ao deslogar', () => {
    user$.next({ uid: 'user-1' });
    service.loadMe().subscribe();
    httpMock.expectOne('/api/me').flush(me);
    service.markSubscriptionRequired();

    user$.next(null);

    expect(service.loaded()).toBeFalse();
    expect(service.subscription().status).toBe('none');
    expect(service.subscriptionRequired()).toBeFalse();
  });
});
