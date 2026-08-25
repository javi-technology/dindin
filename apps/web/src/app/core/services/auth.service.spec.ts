import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';

describe('AuthService', () => {
  let service: AuthService;
  let getIdTokenResultSpy: jasmine.Spy;

  beforeEach(() => {
    getIdTokenResultSpy = jasmine.createSpy('getIdTokenResult');
    const authMock = {
      currentUser: {
        getIdTokenResult: getIdTokenResultSpy,
      },
    };

    TestBed.configureTestingModule({
      providers: [AuthService, { provide: Auth, useValue: authMock }],
    });
    service = TestBed.inject(AuthService);
  });

  it('deve ser criado', () => {
    expect(service).toBeTruthy();
  });

  it('isAdmin deve retornar true quando o token possui claim admin', async () => {
    getIdTokenResultSpy.and.returnValue(
      Promise.resolve({ claims: { admin: true } }),
    );

    const result = await service.isAdmin();

    expect(result).toBeTrue();
    expect(getIdTokenResultSpy).toHaveBeenCalledWith(true);
  });

  it('isAdmin deve retornar false quando o token não possui claim admin', async () => {
    getIdTokenResultSpy.and.returnValue(Promise.resolve({ claims: {} }));

    const result = await service.isAdmin();

    expect(result).toBeFalse();
  });

  it('isAdmin deve retornar false quando não há usuário logado', async () => {
    service = TestBed.inject(AuthService);
    (service as any).auth.currentUser = null;

    const result = await service.isAdmin();

    expect(result).toBeFalse();
    expect(getIdTokenResultSpy).not.toHaveBeenCalled();
  });
});
