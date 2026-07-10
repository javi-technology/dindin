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

describe('unauthorizedInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceMock = jasmine.createSpyObj('AuthService', ['logout']);
    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceMock },
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
});
