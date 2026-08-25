import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Auth, User } from '@angular/fire/auth';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authMock: { authStateReady: jasmine.Spy; currentUser: User | null };
  let authServiceMock: { isAdmin: jasmine.Spy };
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authMock = {
      authStateReady: jasmine
        .createSpy('authStateReady')
        .and.returnValue(Promise.resolve()),
      currentUser: null,
    };
    authServiceMock = {
      isAdmin: jasmine.createSpy('isAdmin'),
    };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: authMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir acesso quando usuário é admin', async () => {
    authMock.currentUser = { uid: 'admin-123' } as User;
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    const result = await TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    );

    expect(result).toBeTrue();
    expect(routerMock.parseUrl).not.toHaveBeenCalled();
  });

  it('deve redirecionar para login quando usuário não está autenticado', async () => {
    authMock.currentUser = null;

    const result = await TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    );

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/login');
    expect(result).toBe(routerMock.parseUrl('/login'));
  });

  it('deve redirecionar para home quando usuário não é admin', async () => {
    authMock.currentUser = { uid: 'user-123' } as User;
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    const result = await TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    );

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/');
    expect(result).toBe(routerMock.parseUrl('/'));
  });
});
