import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { User } from '@angular/fire/auth';
import { of, Observable } from 'rxjs';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authServiceMock: {
    user$: Observable<User | null>;
    isAdmin: jasmine.Spy;
  };
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceMock = {
      user$: of(null),
      isAdmin: jasmine.createSpy('isAdmin'),
    };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir acesso quando usuário é admin', (done) => {
    authServiceMock.user$ = of({ uid: 'admin-123' } as User);
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(true));

    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;

    result.subscribe((value) => {
      expect(value).toBeTrue();
      expect(routerMock.parseUrl).not.toHaveBeenCalled();
      done();
    });
  });

  it('deve redirecionar para login quando usuário não está autenticado', (done) => {
    authServiceMock.user$ = of(null);
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;

    result.subscribe((value) => {
      expect(routerMock.parseUrl).toHaveBeenCalledWith('/login');
      expect(value).toBe(routerMock.parseUrl('/login'));
      done();
    });
  });

  it('deve redirecionar para home quando usuário não é admin', (done) => {
    authServiceMock.user$ = of({ uid: 'user-123' } as User);
    authServiceMock.isAdmin.and.returnValue(Promise.resolve(false));

    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;

    result.subscribe((value) => {
      expect(routerMock.parseUrl).toHaveBeenCalledWith('/');
      expect(value).toBe(routerMock.parseUrl('/'));
      done();
    });
  });
});
