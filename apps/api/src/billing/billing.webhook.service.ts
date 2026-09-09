import type Stripe from 'stripe';
import * as admin from 'firebase-admin';
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

async function upsert(
  uid: string,
  mapped: UserSubscription,
  eventCreated?: number,
): Promise<void> {
  if (typeof eventCreated === 'number') {
    mapped.providerEventCreated = eventCreated;
  }
  const ref = subscriptionDoc(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const stored = snapshot.data()?.providerEventCreated;
    if (
      typeof eventCreated === 'number' &&
      typeof stored === 'number' &&
      stored > eventCreated
    ) {
      console.warn(
        '[billing.webhook] evento antigo ignorado',
        uid,
        eventCreated,
      );
      return;
    }
    tx.set(ref, mapped, { merge: true });
  });
}

async function handleSubscriptionEvent(
  sub: Stripe.Subscription,
  eventCreated?: number,
  forceStatus?: UserSubscription['status'],
): Promise<void> {
  const uid = await resolveUidWithCustomer(sub);
  if (!uid) {
    console.warn('[billing.webhook] uid não encontrado para', sub.id);
    return;
  }
  const mapped = mapSubscription(sub, customerIdOf(sub));
  if (forceStatus) mapped.status = forceStatus;
  await upsert(uid, mapped, eventCreated);
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
      await upsert(uid, mapSubscription(sub, customerIdOf(sub)), event.created);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        event.created,
      );
      return;

    case 'customer.subscription.deleted':
      await handleSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        event.created,
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
        event.created,
        event.type === 'invoice.payment_failed' ? 'past_due' : undefined,
      );
      return;
    }

    default:
      return;
  }
}
