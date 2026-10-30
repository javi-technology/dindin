import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { AppComponent } from './app.component';
import { of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { BillingService } from './core/services/billing.service';
import { APP_VERSION } from '../environments/version';
import { RateLimitNoticeService } from './core/services/rate-limit-notice.service';

@Component({
  selector: 'app-stub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class StubComponent {}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let authServiceMock: {
    user: ReturnType<typeof signal>;
    logout: any;
  };
  let billingServiceMock: {
    loaded: ReturnType<typeof signal<boolean>>;
    isSubscriber: ReturnType<typeof signal<boolean>>;
    hasProjections: ReturnType<typeof signal<boolean>>;
    subscriptionRequired: ReturnType<typeof signal<boolean>>;
    loadMe: any;
  };

  beforeEach(async () => {
    authServiceMock = {
      user: signal<{ email: string } | null>(null),
      logout: jasmine.createSpy('logout').and.resolveTo(undefined),
    };
    billingServiceMock = {
      loaded: signal(false),
      isSubscriber: signal(false),
      hasProjections: signal(false),
      subscriptionRequired: signal(false),
      loadMe: jasmine.createSpy('loadMe').and.returnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: 'carteira', component: StubComponent }]),
        provideLocationMocks(),
        { provide: AuthService, useValue: authServiceMock },
        { provide: BillingService, useValue: billingServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
  });

  it('deve exibir navegação entre dashboard, carteira, geladeira, proventos, carteira recomendada, simulação e assinatura quando autenticado', () => {
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
      'Simulação',
      'Assinatura',
    ]);
  });

  it('deve mostrar o aviso de rate limit em qualquer tela do shell', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="rate-limit-notice"]'),
    ).toBeNull();

    TestBed.inject(RateLimitNoticeService).show(30);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="rate-limit-notice"]')
        ?.textContent,
    ).toContain('Aguarde 30 segundos');
    TestBed.inject(RateLimitNoticeService).dismiss();
  });

  it('deve destacar a rota ativa sobrepondo a cor base do link', async () => {
    authServiceMock.user.set({ email: 'user@dindin.app' });
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl('/carteira');
    fixture.detectChanges();

    const active = fixture.nativeElement.querySelector(
      '[data-testid="main-nav"] a[href="/carteira"]',
    ) as HTMLAnchorElement;

    expect(active.classList).toContain('text-action!');
  });

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

  // A simulação é recurso de assinante (issue #573): o cadeado avisa antes do
  // clique, em vez de o usuário só descobrir no paywall.
  describe('cadeado da simulação', () => {
    const lock = () =>
      fixture.nativeElement.querySelector('[data-testid="simulation-lock"]');
    const tooltip = () =>
      fixture.nativeElement.querySelector(
        '[data-testid="simulation-lock-tooltip"]',
      );

    beforeEach(() => {
      authServiceMock.user.set({ email: 'user@dindin.app' });
      billingServiceMock.loaded.set(true);
    });

    it('deve mostrar o cadeado e a mensagem para quem não assina', () => {
      fixture.detectChanges();

      expect(lock()).not.toBeNull();
      expect(tooltip()?.textContent?.trim()).toBe('Exclusivo para assinantes');
      expect(tooltip()?.getAttribute('role')).toBe('tooltip');
    });

    it('deve ligar a mensagem ao link para leitores de tela', () => {
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector(
        '[data-testid="simulation-link"]',
      ) as HTMLElement;
      expect(link.getAttribute('aria-describedby')).toBe(tooltip()?.id);
    });

    it('não deve mostrar o cadeado para quem assina', () => {
      billingServiceMock.hasProjections.set(true);
      fixture.detectChanges();

      expect(lock()).toBeNull();
      expect(tooltip()).toBeNull();
    });

    it('deve mostrar o cadeado quando a API passa a exigir assinatura', () => {
      billingServiceMock.hasProjections.set(true);
      billingServiceMock.subscriptionRequired.set(true);
      fixture.detectChanges();

      expect(lock()).not.toBeNull();
    });

    it('não deve mostrar o cadeado antes de saber da assinatura', () => {
      billingServiceMock.loaded.set(false);
      fixture.detectChanges();

      expect(lock()).toBeNull();
    });
  });
});
