import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    authServiceMock = jasmine.createSpyObj('AuthService', [
      'loginWithEmail',
      'loginWithGoogle',
    ]);
    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('deve renderizar formulário de login', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('form')).toBeTruthy();
    expect(compiled.querySelector('input#email')).toBeTruthy();
    expect(compiled.querySelector('input#password')).toBeTruthy();
  });

  it('deve fazer login com email e redirecionar para home', async () => {
    authServiceMock.loginWithEmail.and.resolveTo();

    fixture.componentInstance.email = 'user@example.com';
    fixture.componentInstance.password = 'secret';
    await fixture.componentInstance.loginWithEmail();

    expect(authServiceMock.loginWithEmail).toHaveBeenCalledWith(
      'user@example.com',
      'secret',
    );
    expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    expect(fixture.componentInstance.error).toBeNull();
  });

  it('deve exibir mensagem de erro quando login falhar', async () => {
    authServiceMock.loginWithEmail.and.rejectWith(new Error('invalid'));

    fixture.componentInstance.email = 'user@example.com';
    fixture.componentInstance.password = 'wrong';
    await fixture.componentInstance.loginWithEmail();

    expect(fixture.componentInstance.error).toBe('E-mail ou senha inválidos.');
  });

  it('deve fazer login com Google e redirecionar para home', async () => {
    authServiceMock.loginWithGoogle.and.resolveTo();

    await fixture.componentInstance.loginWithGoogle();

    expect(authServiceMock.loginWithGoogle).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
  });

  it('deve exibir mensagem de erro quando login com Google falhar', async () => {
    authServiceMock.loginWithGoogle.and.rejectWith(new Error('popup closed'));

    await fixture.componentInstance.loginWithGoogle();

    expect(fixture.componentInstance.error).toBe(
      'Erro ao fazer login com Google.',
    );
  });
});
