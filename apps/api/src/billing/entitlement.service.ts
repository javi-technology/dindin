import * as admin from 'firebase-admin';
import {
  Entitlement,
  PublicSubscription,
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
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('billing')
    .doc('subscription');
}

export async function getSubscription(uid: string): Promise<UserSubscription> {
  const snapshot = await subscriptionDoc(uid).get();
  if (!snapshot.exists) return NO_SUBSCRIPTION;
  return {
    ...NO_SUBSCRIPTION,
    ...(snapshot.data() as Partial<UserSubscription>),
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
 * `ai` é liberado quando a assinatura está `trialing`/`active`, ou `past_due`
 * ainda dentro do período pago (carência até `currentPeriodEnd`), ou o
 * usuário é admin.
 */
export function isEntitled(
  subscription: UserSubscription,
  entitlement: Entitlement,
  isAdmin = false,
  now: Date = new Date(),
): boolean {
  if (isAdmin) return true;
  if (entitlement !== 'ai') return false;

  switch (subscription.status) {
    case 'trialing':
    case 'active':
      return true;
    case 'past_due':
      return (
        subscription.currentPeriodEnd !== null &&
        new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
      );
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
