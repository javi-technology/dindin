import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { User } from '@angular/fire/auth';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceMock: { user: () => User | null };
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceMock = { user: () => null };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir acesso quando usuário está autenticado', () => {
    authServiceMock.user = () => ({ uid: 'user-123' }) as User;

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBeTrue();
    expect(routerMock.parseUrl).not.toHaveBeenCalled();
  });

  it('deve redirecionar para login quando usuário não está autenticado', () => {
    authServiceMock.user = () => null;

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/login');
    expect(result).toBe(routerMock.parseUrl('/login'));
  });
});
