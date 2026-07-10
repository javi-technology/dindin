import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { User } from '@angular/fire/auth';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceMock: { user: () => User | null };

  beforeEach(() => {
    authServiceMock = { user: () => null };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceMock },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve adicionar header Authorization quando usuário está autenticado', fakeAsync(() => {
    const userMock = {
      getIdToken: jasmine
        .createSpy('getIdToken')
        .and.returnValue(Promise.resolve('token-123')),
    } as unknown as User;
    authServiceMock.user = () => userMock;

    httpClient.get('/api/me').subscribe();
    tick();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.headers.has('Authorization')).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({});
  }));

  it('deve manter requisição sem alteração quando não há usuário autenticado', () => {
    authServiceMock.user = () => null;

    httpClient.get('/api/health').subscribe();

    const req = httpMock.expectOne('/api/health');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
