import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { FIREBASE_AUTH } from '../firebase/firebase-auth';

describe('AuthService', () => {
  let service: AuthService;
  let getIdTokenResultSpy: any;

  beforeEach(() => {
    getIdTokenResultSpy = jasmine.createSpy('getIdTokenResult');
    const authMock = {
      currentUser: {
        getIdTokenResult: getIdTokenResultSpy,
      },
    };

    TestBed.configureTestingModule({
      providers: [AuthService, { provide: FIREBASE_AUTH, useValue: authMock }],
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

    expect(result).toBe(true);
    expect(getIdTokenResultSpy).toHaveBeenCalledWith(true);
  });

  it('isAdmin deve retornar false quando o token não possui claim admin', async () => {
    getIdTokenResultSpy.and.returnValue(Promise.resolve({ claims: {} }));

    const result = await service.isAdmin();

    expect(result).toBe(false);
  });

  it('isAdmin deve retornar false quando não há usuário logado', async () => {
    service = TestBed.inject(AuthService);
    (service as any).auth.currentUser = null;

    const result = await service.isAdmin();

    expect(result).toBe(false);
    expect(getIdTokenResultSpy).not.toHaveBeenCalled();
  });
});
