import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import {
  Entitlement,
  MeResponse,
  PublicSubscription,
  SubscriptionInterval,
} from 'dindin-shared-types';

const EMPTY_SUBSCRIPTION: PublicSubscription = {
  status: 'none',
  plan: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

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
  /** Ligado pelo interceptor quando a API responde SUBSCRIPTION_REQUIRED. */
  readonly subscriptionRequired = signal(false);

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
    this.meState.update((me) =>
      me
        ? {
            ...me,
            entitlements: me.entitlements.filter(
              (entitlement) => entitlement !== 'ai',
            ),
          }
        : me,
    );
  }

  redirectTo(url: string): void {
    window.location.assign(url);
  }
}
