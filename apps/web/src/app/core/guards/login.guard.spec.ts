import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { User } from '@angular/fire/auth';
import { of, Observable } from 'rxjs';
import { loginGuard } from './login.guard';
import { AuthService } from '../services/auth.service';

describe('loginGuard', () => {
  let authServiceMock: { user$: Observable<User | null> };
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceMock = { user$: of(null) };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('deve permitir acesso à tela de login quando usuário não está autenticado', (done) => {
    authServiceMock.user$ = of(null);

    const result = TestBed.runInInjectionContext(() =>
      loginGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;

    result.subscribe((value) => {
      expect(value).toBeTrue();
      expect(routerMock.parseUrl).not.toHaveBeenCalled();
      done();
    });
  });

  it('deve redirecionar para home quando usuário já está autenticado', (done) => {
    authServiceMock.user$ = of({ uid: 'user-123' } as User);

    const result = TestBed.runInInjectionContext(() =>
      loginGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;

    result.subscribe(() => {
      expect(routerMock.parseUrl).toHaveBeenCalledWith('/');
      done();
    });
  });
});
