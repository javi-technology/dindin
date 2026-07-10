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
import { ReplaySubject } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let user$: ReplaySubject<User | null>;

  beforeEach(() => {
    user$ = new ReplaySubject<User | null>(1);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user$: user$.asObservable() } },
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
    user$.next(userMock);

    httpClient.get('/api/me').subscribe();
    tick();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.headers.has('Authorization')).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({});
  }));

  it('deve manter requisição sem alteração quando não há usuário autenticado', () => {
    user$.next(null);

    httpClient.get('/api/health').subscribe();

    const req = httpMock.expectOne('/api/health');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('deve aguardar emissão do user$ antes de prosseguir com a requisição', fakeAsync(() => {
    const userMock = {
      getIdToken: jasmine
        .createSpy('getIdToken')
        .and.returnValue(Promise.resolve('token-delayed')),
    } as unknown as User;

    httpClient.get('/api/me').subscribe();

    httpMock.expectNone('/api/me');

    tick();
    user$.next(userMock);
    tick();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer token-delayed',
    );
    req.flush({});
  }));

  it('deve prosseguir sem header quando falhar ao obter token', fakeAsync(() => {
    const userMock = {
      getIdToken: jasmine
        .createSpy('getIdToken')
        .and.returnValue(Promise.reject(new Error('token error'))),
    } as unknown as User;
    user$.next(userMock);

    httpClient.get('/api/me').subscribe({ error: () => {} });
    tick();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
  }));
});
