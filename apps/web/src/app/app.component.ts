import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  Router,
} from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { BillingService } from './core/services/billing.service';
import { APP_VERSION } from '../environments/version';
import { RateLimitNoticeComponent } from './shared/components/rate-limit-notice/rate-limit-notice.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';
import { LucideLock } from '@lucide/angular';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeToggleComponent,
    RateLimitNoticeComponent,
    LucideLock,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly billingService = inject(BillingService);
  private readonly destroyRef = inject(DestroyRef);

  user = this.authService.user;
  readonly subscriptionLoaded = this.billingService.loaded;
  readonly isSubscriber = this.billingService.isSubscriber;
  readonly version = APP_VERSION;
  /**
   * Cadeado no link da simulação, recurso de assinante (issue #573). Usa o
   * mesmo critério da página, para o menu e a tela nunca discordarem, e só
   * aparece depois de a assinatura carregar: antes disso, o assinante veria
   * um cadeado que não é dele.
   */
  readonly simulationLocked = computed(
    () =>
      this.billingService.loaded() &&
      (!this.billingService.hasProjections() ||
        this.billingService.subscriptionRequired()),
  );

  constructor() {
    // Carrega a assinatura para a badge do cabeçalho; o BillingService limpa o
    // estado ao trocar de usuário, o que dispara um novo carregamento.
    effect(() => {
      if (this.user() && !this.subscriptionLoaded()) {
        this.billingService
          .loadMe()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({ error: () => undefined });
      }
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/login']);
  }
}
