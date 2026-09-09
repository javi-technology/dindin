import type Stripe from 'stripe';
import { UserSubscription } from 'dindin-shared-types';
import { getStripe } from './stripe.client';
import { mapSubscription, resolveUid } from './subscription-mapper';
import { subscriptionDoc } from './entitlement.service';

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
}

async function resolveUidWithCustomer(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const uid = resolveUid(sub);
  if (uid) return uid;
  const customer = await getStripe().customers.retrieve(customerIdOf(sub));
  return resolveUid(sub, customer);
}

async function upsert(uid: string, mapped: UserSubscription): Promise<void> {
  await subscriptionDoc(uid).set(mapped, { merge: true });
}

async function handleSubscriptionEvent(
  sub: Stripe.Subscription,
  forceStatus?: UserSubscription['status'],
): Promise<void> {
  const uid = await resolveUidWithCustomer(sub);
  if (!uid) {
    console.warn('[billing.webhook] uid não encontrado para', sub.id);
    return;
  }
  const mapped = mapSubscription(sub, customerIdOf(sub));
  if (forceStatus) mapped.status = forceStatus;
  await upsert(uid, mapped);
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      const uid =
        session.client_reference_id ?? (await resolveUidWithCustomer(sub));
      if (!uid) {
        console.warn('[billing.webhook] uid não encontrado para', session.id);
        return;
      }
      await upsert(uid, mapSubscription(sub, customerIdOf(sub)));
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
      return;

    case 'customer.subscription.deleted':
      await handleSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        'canceled',
      );
      return;

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = invoice.parent?.subscription_details?.subscription;
      const subId = typeof sub === 'string' ? sub : sub?.id;
      if (!subId) return;
      const subscription = await stripe.subscriptions.retrieve(subId);
      await handleSubscriptionEvent(
        subscription,
        event.type === 'invoice.payment_failed' ? 'past_due' : undefined,
      );
      return;
    }

    default:
      return;
  }
}
