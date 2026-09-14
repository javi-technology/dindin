import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component, signal } from '@angular/core';
import { AppComponent } from './app.component';
import { of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { BillingService } from './core/services/billing.service';
import { APP_VERSION } from '../environments/version';

@Component({ selector: 'app-stub', standalone: true, template: '' })
class StubComponent {}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let authServiceMock: {
    user: ReturnType<typeof signal>;
    logout: jasmine.Spy;
  };
  let billingServiceMock: {
    loaded: ReturnType<typeof signal<boolean>>;
    isSubscriber: ReturnType<typeof signal<boolean>>;
    loadMe: jasmine.Spy;
  };

  beforeEach(async () => {
    authServiceMock = {
      user: signal<{ email: string } | null>(null),
      logout: jasmine.createSpy('logout').and.resolveTo(undefined),
    };
    billingServiceMock = {
      loaded: signal(false),
      isSubscriber: signal(false),
      loadMe: jasmine.createSpy('loadMe').and.returnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: 'carteira', component: StubComponent }]),
        { provide: AuthService, useValue: authServiceMock },
        { provide: BillingService, useValue: billingServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
  });

  it('deve exibir navegação entre dashboard, carteira, geladeira, proventos, carteira recomendada e assinatura quando autenticado', () => {
    authServiceMock.user.set({ email: 'user@dindin.app' });

    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="main-nav"] a'),
    ).map((link) => (link as HTMLAnchorElement).textContent?.trim());

    expect(links).toEqual([
      'Dashboard',
      'Carteira',
      'Geladeira',
      'Proventos',
      'Carteira recomendada',
      'Assinatura',
    ]);
  });

  it('deve destacar a rota ativa sobrepondo a cor base do link', fakeAsync(() => {
    authServiceMock.user.set({ email: 'user@dindin.app' });
    fixture.detectChanges();

    TestBed.inject(Router).navigate(['/carteira']);
    tick();
    fixture.detectChanges();

    const active = fixture.nativeElement.querySelector(
      '[data-testid="main-nav"] a[href="/carteira"]',
    ) as HTMLAnchorElement;

    expect(active.classList).toContain('!text-blue-600');
  }));

  it('não deve exibir navegação quando não autenticado', () => {
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="main-nav"]'),
    ).toBeFalsy();
  });

  it('deve exibir no rodapé a versão em execução', () => {
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector(
      '[data-testid="app-version"]',
    ) as HTMLElement;

    expect(footer.textContent?.trim()).toBe(`v${APP_VERSION}`);
  });

  it('deve exibir a versão também quando não autenticado', () => {
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('footer [data-testid="app-version"]'),
    ).toBeTruthy();
  });

  describe('badge de assinatura', () => {
    function badge(): HTMLElement | null {
      return fixture.nativeElement.querySelector(
        '[data-testid="subscription-badge"]',
      );
    }

    it('deve carregar a assinatura quando autenticado', () => {
      authServiceMock.user.set({ email: 'user@dindin.app' });

      fixture.detectChanges();

      expect(billingServiceMock.loadMe).toHaveBeenCalledTimes(1);
    });

    it('não deve recarregar a assinatura já carregada', () => {
      billingServiceMock.loaded.set(true);
      authServiceMock.user.set({ email: 'user@dindin.app' });

      fixture.detectChanges();

      expect(billingServiceMock.loadMe).not.toHaveBeenCalled();
    });

    it('deve exibir "Assinante" para conta assinante', () => {
      billingServiceMock.loaded.set(true);
      billingServiceMock.isSubscriber.set(true);
      authServiceMock.user.set({ email: 'user@dindin.app' });

      fixture.detectChanges();

      expect(badge()?.textContent?.trim()).toBe('Assinante');
    });

    it('deve exibir "Não assinante" para conta sem assinatura', () => {
      billingServiceMock.loaded.set(true);
      authServiceMock.user.set({ email: 'user@dindin.app' });

      fixture.detectChanges();

      expect(badge()?.textContent?.trim()).toBe('Não assinante');
    });

    it('não deve exibir a badge enquanto a assinatura não carregou', () => {
      authServiceMock.user.set({ email: 'user@dindin.app' });

      fixture.detectChanges();

      expect(badge()).toBeNull();
    });

    it('não deve exibir a badge nem carregar assinatura sem autenticação', () => {
      billingServiceMock.loaded.set(true);

      fixture.detectChanges();

      expect(badge()).toBeNull();
      expect(billingServiceMock.loadMe).not.toHaveBeenCalled();
    });
  });
});
