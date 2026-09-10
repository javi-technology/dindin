import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { unauthorizedInterceptor } from './unauthorized.interceptor';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';

describe('unauthorizedInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let billingServiceMock: jasmine.SpyObj<BillingService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceMock = jasmine.createSpyObj('AuthService', ['logout']);
    billingServiceMock = jasmine.createSpyObj('BillingService', [
      'markSubscriptionRequired',
    ]);
    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceMock },
        { provide: BillingService, useValue: billingServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve deslogar e redirecionar para login quando receber 401', () => {
    httpClient.get('/api/me').subscribe({
      error: () => {
        expect(authServiceMock.logout).toHaveBeenCalled();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
      },
    });

    const req = httpMock.expectOne('/api/me');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('não deve deslogar quando a requisição for bem-sucedida', () => {
    httpClient.get('/api/health').subscribe();

    const req = httpMock.expectOne('/api/health');
    req.flush({});

    expect(authServiceMock.logout).not.toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('deve marcar assinatura exigida ao receber 403 SUBSCRIPTION_REQUIRED', () => {
    httpClient.get('/api/recommended-wallets/bb-fii/suggestions').subscribe({
      error: () => {
        expect(billingServiceMock.markSubscriptionRequired).toHaveBeenCalled();
        expect(authServiceMock.logout).not.toHaveBeenCalled();
        expect(routerMock.navigate).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne(
      '/api/recommended-wallets/bb-fii/suggestions',
    );
    req.flush(
      { error: 'Forbidden', code: 'SUBSCRIPTION_REQUIRED' },
      { status: 403, statusText: 'Forbidden' },
    );
  });

  it('não deve marcar assinatura exigida em 403 sem código', () => {
    httpClient.get('/api/alguma-coisa').subscribe({
      error: () => {
        expect(
          billingServiceMock.markSubscriptionRequired,
        ).not.toHaveBeenCalled();
        expect(authServiceMock.logout).not.toHaveBeenCalled();
        expect(routerMock.navigate).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/alguma-coisa');
    req.flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
  });
});
