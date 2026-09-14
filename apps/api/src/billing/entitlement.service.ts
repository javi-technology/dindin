import { getFirestore } from 'firebase-admin/firestore';
import {
  Entitlement,
  PublicSubscription,
  StripeSubscriptionState,
  SubscriptionStatus,
  UserSubscription,
} from 'dindin-shared-types';

export const NO_SUBSCRIPTION: UserSubscription = {
  status: 'none',
  plan: null,
  interval: null,
  provider: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  updatedAt: new Date(0).toISOString(),
};

export function subscriptionDoc(uid: string) {
  return getFirestore()
    .collection('users')
    .doc(uid)
    .collection('billing')
    .doc('subscription');
}

export async function getSubscription(uid: string): Promise<UserSubscription> {
  const snapshot = await subscriptionDoc(uid).get();
  if (!snapshot.exists) return NO_SUBSCRIPTION;
  return resolveSubscription({
    ...NO_SUBSCRIPTION,
    ...(snapshot.data() as Partial<UserSubscription>),
  });
}

/** Extrai do estado principal a parte que pertence à assinatura Stripe. */
export function toStripeState(
  subscription: UserSubscription,
): StripeSubscriptionState {
  return {
    status: subscription.status,
    interval: subscription.interval,
    ...(subscription.providerSubscriptionId
      ? { providerSubscriptionId: subscription.providerSubscriptionId }
      : {}),
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    updatedAt: subscription.updatedAt,
  };
}

/**
 * Antes da #173, abrir o checkout gravava `provider: 'stripe'` sobre uma
 * concessão manual. Uma assinatura Stripe real sempre tem
 * `providerSubscriptionId` (gravado pelo webhook); sem ele, um doc
 * `active`/`trialing` é a concessão manual original.
 */
export function repairAbandonedCheckout(
  subscription: UserSubscription,
): UserSubscription {
  const abandoned =
    subscription.provider === 'stripe' &&
    !!subscription.providerCustomerId &&
    !subscription.providerSubscriptionId &&
    (subscription.status === 'active' || subscription.status === 'trialing');
  return abandoned ? { ...subscription, provider: 'manual' } : subscription;
}

const STRIPE_IN_FORCE: SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
];

/**
 * Estado efetivo do documento (#171): quando a concessão manual não está mais
 * vigente (expirada ou revogada) e a Stripe guardada segue ativa, trialing ou
 * past_due, vale a Stripe — sem depender de um novo evento do webhook.
 */
export function resolveSubscription(
  doc: UserSubscription,
  now: Date = new Date(),
): UserSubscription {
  const subscription = repairAbandonedCheckout(doc);
  const { stripe } = subscription;
  if (
    subscription.provider !== 'manual' ||
    !stripe ||
    !STRIPE_IN_FORCE.includes(stripe.status) ||
    isEntitled(subscription, 'ai', false, now)
  ) {
    return subscription;
  }
  return {
    ...subscription,
    status: stripe.status,
    plan: 'basic',
    interval: stripe.interval,
    provider: 'stripe',
    providerSubscriptionId:
      stripe.providerSubscriptionId ?? subscription.providerSubscriptionId,
    currentPeriodEnd: stripe.currentPeriodEnd,
    cancelAtPeriodEnd: stripe.cancelAtPeriodEnd,
  };
}

export function toPublicSubscription(
  subscription: UserSubscription,
): PublicSubscription {
  return {
    status: subscription.status,
    plan: subscription.plan,
    interval: subscription.interval,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

/**
 * Status considerado pelo checkout e pelo `GET /api/me`: concessão `manual`
 * expirada equivale a `canceled` (o documento continua `active`).
 */
export function effectiveStatus(
  subscription: UserSubscription,
  now: Date = new Date(),
): SubscriptionStatus {
  const expiredManual =
    subscription.provider === 'manual' &&
    subscription.currentPeriodEnd !== null &&
    new Date(subscription.currentPeriodEnd).getTime() <= now.getTime();
  return expiredManual &&
    (subscription.status === 'active' || subscription.status === 'trialing')
    ? 'canceled'
    : subscription.status;
}

/**
 * `ai` é liberado quando a assinatura está `trialing`/`active`, ou `past_due`
 * ainda dentro do período pago (carência até `currentPeriodEnd`), ou o
 * usuário é admin. Concessões `manual` expiram em `currentPeriodEnd`
 * (`null` = sem validade).
 */
export function isEntitled(
  subscription: UserSubscription,
  entitlement: Entitlement,
  isAdmin = false,
  now: Date = new Date(),
): boolean {
  if (isAdmin) return true;
  if (entitlement !== 'ai') return false;

  const withinPeriod =
    subscription.currentPeriodEnd !== null &&
    new Date(subscription.currentPeriodEnd).getTime() > now.getTime();

  switch (subscription.status) {
    case 'trialing':
    case 'active':
      return (
        subscription.provider !== 'manual' ||
        subscription.currentPeriodEnd === null ||
        withinPeriod
      );
    case 'past_due':
      return withinPeriod;
    default:
      return false;
  }
}

export async function hasEntitlement(
  uid: string,
  entitlement: Entitlement,
  isAdmin = false,
): Promise<boolean> {
  if (isAdmin) return true;
  const subscription = await getSubscription(uid);
  return isEntitled(subscription, entitlement, isAdmin);
}

export function listEntitlements(
  subscription: UserSubscription,
  isAdmin = false,
): Entitlement[] {
  const all: Entitlement[] = ['ai'];
  return all.filter((e) => isEntitled(subscription, e, isAdmin));
}
