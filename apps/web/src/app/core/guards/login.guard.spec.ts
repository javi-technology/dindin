import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Auth, User } from '@angular/fire/auth';
import { loginGuard } from './login.guard';

describe('loginGuard', () => {
  let authMock: { authStateReady: jasmine.Spy; currentUser: User | null };
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authMock = {
      authStateReady: jasmine
        .createSpy('authStateReady')
        .and.returnValue(Promise.resolve()),
      currentUser: null,
    };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir acesso à tela de login quando usuário não está autenticado', async () => {
    authMock.currentUser = null;

    const result = await TestBed.runInInjectionContext(() =>
      loginGuard({} as never, {} as never),
    );

    expect(result).toBeTrue();
    expect(routerMock.parseUrl).not.toHaveBeenCalled();
  });

  it('deve redirecionar para home quando usuário já está autenticado', async () => {
    authMock.currentUser = { uid: 'user-123' } as User;

    const result = await TestBed.runInInjectionContext(() =>
      loginGuard({} as never, {} as never),
    );

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/');
    expect(result).toBe(routerMock.parseUrl('/'));
  });
});
