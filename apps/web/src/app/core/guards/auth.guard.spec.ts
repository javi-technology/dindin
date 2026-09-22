import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { User } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase-auth';
import { authGuard } from './auth.guard';
import { SetupService } from '../services/setup.service';

describe('authGuard', () => {
  let authMock: { authStateReady: any; currentUser: User | null };
  let routerMock: jasmine.SpyObj<Router>;
  let setupServiceMock: jasmine.SpyObj<SetupService>;

  beforeEach(() => {
    authMock = {
      authStateReady: jasmine
        .createSpy('authStateReady')
        .and.returnValue(Promise.resolve()),
      currentUser: null,
    };
    routerMock = jasmine.createSpyObj('Router', ['parseUrl']);
    routerMock.parseUrl.and.returnValue({} as UrlTree);
    setupServiceMock = jasmine.createSpyObj('SetupService', ['ensureDefaults']);
    setupServiceMock.ensureDefaults.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useValue: authMock },
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
      ],
    });
  });

  it('deve permitir acesso quando usuário está autenticado', async () => {
    authMock.currentUser = { uid: 'user-123' } as User;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(routerMock.parseUrl).not.toHaveBeenCalled();
  });

  it('deve redirecionar para login quando usuário não está autenticado', async () => {
    authMock.currentUser = null;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/login');
    expect(result).toBe(routerMock.parseUrl('/login'));
    expect(setupServiceMock.ensureDefaults).not.toHaveBeenCalled();
  });

  it('deve provisionar carteira e geladeira padrão antes de liberar a tela (#275)', async () => {
    authMock.currentUser = { uid: 'user-123' } as User;
    let finishSetup!: () => void;
    setupServiceMock.ensureDefaults.and.returnValue(
      new Promise<void>((resolve) => (finishSetup = resolve)),
    );

    let settled = false;
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    ) as Promise<boolean | UrlTree>;
    result.then(() => (settled = true));
    await Promise.resolve();
    await Promise.resolve();

    expect(setupServiceMock.ensureDefaults).toHaveBeenCalledWith('user-123');
    expect(settled).toBe(false);

    finishSetup();
    expect(await result).toBe(true);
  });
});
