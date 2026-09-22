import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import {
  Entitlement,
  MeResponse,
  PublicSubscription,
  SubscriptionInterval,
  SubscriptionStatus,
} from 'dindin-shared-types';
import { AuthService } from './auth.service';

const EMPTY_SUBSCRIPTION: PublicSubscription = {
  status: 'none',
  plan: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

const SUBSCRIBER_STATUSES: SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
];

@Injectable({
  providedIn: 'root',
})
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly meState = signal<MeResponse | null>(null);

  readonly me = this.meState.asReadonly();
  readonly loaded = computed(() => this.meState() !== null);
  readonly subscription = computed<PublicSubscription>(
    () => this.meState()?.subscription ?? EMPTY_SUBSCRIPTION,
  );
  readonly entitlements = computed<Entitlement[]>(
    () => this.meState()?.entitlements ?? [],
  );
  readonly hasAi = computed(() => this.entitlements().includes('ai'));
  /** Projeção completa por ativo e agenda de pagamentos (#262). */
  readonly hasProjections = computed(() =>
    this.entitlements().includes('projections'),
  );
  /**
   * Indica assinatura vigente, independente do acesso de admin. O `/api/me`
   * já devolve concessão manual expirada como `canceled`.
   */
  readonly isSubscriber = computed(() =>
    SUBSCRIBER_STATUSES.includes(this.subscription().status),
  );
  /** Ligado pelo interceptor quando a API responde SUBSCRIPTION_REQUIRED. */
  readonly subscriptionRequired = signal(false);

  private lastUid: string | null = null;

  constructor() {
    inject(AuthService)
      .user$.pipe(takeUntilDestroyed())
      .subscribe((user) => {
        const uid = user?.uid ?? null;
        if (uid !== this.lastUid) {
          this.meState.set(null);
          this.subscriptionRequired.set(false);
          this.lastUid = uid;
        }
      });
  }

  loadMe(): Observable<MeResponse> {
    return this.http.get<MeResponse>('/api/me').pipe(
      tap((me) => {
        this.meState.set(me);
        this.subscriptionRequired.set(false);
      }),
    );
  }

  createCheckoutSession(
    interval: SubscriptionInterval,
  ): Observable<{ url: string }> {
    return this.http.post<{ url: string }>('/api/billing/checkout-session', {
      interval,
    });
  }

  createPortalSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>('/api/billing/portal-session', {});
  }

  startCheckout(interval: SubscriptionInterval): Observable<void> {
    return this.createCheckoutSession(interval).pipe(
      map(({ url }) => this.redirectTo(url)),
    );
  }

  openPortal(): Observable<void> {
    return this.createPortalSession().pipe(
      map(({ url }) => this.redirectTo(url)),
    );
  }

  markSubscriptionRequired(): void {
    this.subscriptionRequired.set(true);
    this.meState.update((me) => (me ? { ...me, entitlements: [] } : me));
  }

  redirectTo(url: string): void {
    window.location.assign(url);
  }
}
