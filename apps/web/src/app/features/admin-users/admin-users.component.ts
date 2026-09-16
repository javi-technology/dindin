import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  LucideArrowLeft,
  LucideSearch,
  LucideShieldCheck,
  LucideShieldOff,
} from '@lucide/angular';
import {
  AdminSubscriptionView,
  AdminUser,
  SubscriptionStatus,
} from 'dindin-shared-types';
import { AdminUserService } from '../../core/services/admin-user.service';

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  none: 'Sem assinatura',
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
};

/** Assinatura Stripe guardada por baixo de uma concessão manual (#171). */
const STRIPE_UNDER_MANUAL_LABELS: Partial<Record<SubscriptionStatus, string>> =
  {
    active: 'Stripe ativa',
    trialing: 'Stripe em teste',
    past_due: 'Stripe pendente',
  };

const STRIPE_REVOKE_MESSAGE =
  'Assinaturas da Stripe só podem ser canceladas pelo próprio usuário no portal de pagamento.';

/** Espelha `ADMIN_USERS_LIMIT` da API: acima disso a busca vem truncada. */
export const ADMIN_USERS_LIMIT = 100;

const GRANT_ERROR_MESSAGES: Record<number, string> = {
  400: 'Não foi possível conceder o acesso. Verifique a validade informada.',
  404: 'Não foi possível conceder o acesso. Usuário não encontrado.',
  409: 'Não foi possível conceder o acesso. Este usuário já tem uma assinatura ativa na Stripe.',
};

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideArrowLeft,
    LucideSearch,
    LucideShieldCheck,
    LucideShieldOff,
  ],
  templateUrl: './admin-users.component.html',
})
export class AdminUsersComponent implements OnInit {
  private readonly adminUserService = inject(AdminUserService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  users = signal<AdminUser[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  grantTarget = signal<AdminUser | null>(null);
  grantError = signal<string | null>(null);
  revokeTarget = signal<AdminUser | null>(null);
  revokeError = signal<string | null>(null);
  saving = signal(false);
  readonly limit = ADMIN_USERS_LIMIT;

  searchControl = new FormControl('', { nonNullable: true });
  grantForm = this.fb.nonNullable.group({ currentPeriodEnd: '' });

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminUserService
      .list(this.searchControl.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar usuários.');
          this.loading.set(false);
        },
      });
  }

  statusLabel(subscription: AdminSubscriptionView): string {
    return this.isExpiredManual(subscription)
      ? 'Expirada'
      : STATUS_LABELS[subscription.status];
  }

  planLabel(subscription: AdminSubscriptionView): string {
    return subscription.plan === 'basic' ? 'Básico' : '—';
  }

  providerLabel(subscription: AdminSubscriptionView): string {
    if (subscription.provider === 'manual') {
      const stripe =
        subscription.stripeStatus &&
        STRIPE_UNDER_MANUAL_LABELS[subscription.stripeStatus];
      return stripe ? `Manual (${stripe})` : 'Manual';
    }
    if (subscription.provider === 'stripe') return 'Stripe';
    return '—';
  }

  isActive(subscription: AdminSubscriptionView): boolean {
    return (
      subscription.status !== 'none' &&
      subscription.status !== 'canceled' &&
      !this.isExpiredManual(subscription)
    );
  }

  canRevoke(user: AdminUser): boolean {
    return (
      user.subscription.provider === 'manual' &&
      user.subscription.status === 'active' &&
      !this.isExpiredManual(user.subscription)
    );
  }

  /** A API recusa concessão manual sobre assinatura Stripe vigente (409). */
  canGrant(user: AdminUser): boolean {
    const { provider, status, currentPeriodEnd } = user.subscription;
    if (provider !== 'stripe') return true;
    if (status === 'active' || status === 'trialing') return false;
    return !(
      status === 'past_due' &&
      currentPeriodEnd !== null &&
      new Date(currentPeriodEnd).getTime() > Date.now()
    );
  }

  reachedLimit(): boolean {
    return this.users().length >= ADMIN_USERS_LIMIT;
  }

  openGrant(user: AdminUser): void {
    this.grantForm.reset({ currentPeriodEnd: '' });
    this.grantError.set(null);
    this.successMessage.set(null);
    this.grantTarget.set(user);
  }

  closeGrant(): void {
    this.grantTarget.set(null);
  }

  confirmGrant(): void {
    const user = this.grantTarget();
    if (!user) return;

    this.saving.set(true);
    this.grantError.set(null);
    this.adminUserService
      .grant(user.uid, {
        plan: 'basic',
        currentPeriodEnd: this.endOfDayIso(
          this.grantForm.getRawValue().currentPeriodEnd,
        ),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.grantTarget.set(null);
          this.successMessage.set(`Acesso concedido a ${user.email}.`);
          this.search();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.grantError.set(
            GRANT_ERROR_MESSAGES[err.status] ??
              'Não foi possível conceder o acesso. Tente novamente.',
          );
        },
      });
  }

  openRevoke(user: AdminUser): void {
    this.revokeError.set(null);
    this.successMessage.set(null);
    this.revokeTarget.set(user);
  }

  closeRevoke(): void {
    this.revokeTarget.set(null);
  }

  confirmRevoke(): void {
    const user = this.revokeTarget();
    if (!user) return;

    this.saving.set(true);
    this.revokeError.set(null);
    this.adminUserService
      .revoke(user.uid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.revokeTarget.set(null);
          this.successMessage.set(`Acesso de ${user.email} revogado.`);
          this.search();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.revokeError.set(
            err.status === 409
              ? STRIPE_REVOKE_MESSAGE
              : 'Não foi possível revogar o acesso. Tente novamente.',
          );
        },
      });
  }

  private isExpiredManual(subscription: AdminSubscriptionView): boolean {
    return (
      subscription.provider === 'manual' &&
      subscription.status === 'active' &&
      subscription.currentPeriodEnd !== null &&
      new Date(subscription.currentPeriodEnd).getTime() <= Date.now()
    );
  }

  /** Converte `YYYY-MM-DD` do input de data para o fim do dia local em ISO. */
  private endOfDayIso(date: string): string | null {
    if (!date) return null;
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59).toISOString();
  }
}
