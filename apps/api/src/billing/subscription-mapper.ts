import type Stripe from 'stripe';
import {
  SubscriptionInterval,
  SubscriptionStatus,
  UserSubscription,
} from 'dindin-shared-types';

export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'none';
  }
}

export function mapSubscription(
  sub: Stripe.Subscription,
  customerId: string,
): UserSubscription {
  const item = sub.items.data[0];
  const rawInterval = item?.price.recurring?.interval;
  const interval: SubscriptionInterval | null =
    rawInterval === 'month' ? 'month' : rawInterval === 'year' ? 'year' : null;
  const periodEnd = item?.current_period_end;

  return {
    status: mapStripeStatus(sub.status),
    plan: 'basic',
    interval: interval === 'month' || interval === 'year' ? interval : null,
    provider: 'stripe',
    providerCustomerId: customerId,
    providerSubscriptionId: sub.id,
    currentPeriodEnd:
      typeof periodEnd === 'number'
        ? new Date(periodEnd * 1000).toISOString()
        : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveUid(
  sub: Stripe.Subscription,
  customer?: Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (sub.metadata?.uid) return sub.metadata.uid;
  if (customer && 'metadata' in customer && customer.metadata?.uid) {
    return customer.metadata.uid;
  }
  return null;
}
