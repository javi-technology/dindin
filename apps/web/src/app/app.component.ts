import {
  Component,
  DestroyRef,
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
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
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
