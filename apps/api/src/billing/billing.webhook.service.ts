import type Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { UserSubscription } from 'dindin-shared-types';
import { getStripe } from './stripe.client';
import { mapSubscription, resolveUid } from './subscription-mapper';
import {
  isEntitled,
  subscriptionDoc,
  toStripeState,
} from './entitlement.service';
import { clearPendingCheckout } from './checkout-session.service';
import { logWarn } from '../shared/logger';

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
  // O estado da Stripe é sempre guardado, inclusive sob concessão manual (#171).
  mapped.stripe = toStripeState(mapped);
  const ref = subscriptionDoc(uid);
  await getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as UserSubscription | undefined;
    const stored = current?.providerEventCreated;
    if (
      typeof eventCreated === 'number' &&
      typeof stored === 'number' &&
      stored > eventCreated
    ) {
      logWarn('billing.webhook.staleEvent', { uid, eventCreated });
      return;
    }
    // Concessão manual vigente tem precedência sobre a Stripe (#150): grava só
    // os ids e o estado guardado da Stripe, que vale quando ela terminar.
    if (current?.provider === 'manual' && isEntitled(current, 'ai')) {
      logWarn('billing.webhook.manualGrantKept', { uid, eventCreated });
      const providerFields: Partial<UserSubscription> = {
        providerCustomerId: mapped.providerCustomerId,
        providerSubscriptionId: mapped.providerSubscriptionId,
        stripe: mapped.stripe,
      };
      if (typeof eventCreated === 'number') {
        providerFields.providerEventCreated = eventCreated;
      }
      tx.set(ref, providerFields, { merge: true });
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
    logWarn('billing.webhook.uidNotFound', { subscriptionId: sub.id });
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
        logWarn('billing.webhook.uidNotFound', { sessionId: session.id });
        return;
      }
      await upsert(uid, mapSubscription(sub, customerIdOf(sub)), event.created);
      // Só depois de gravar: sem reserva nem assinatura, um novo checkout passaria
      await clearPendingCheckout(uid, session.id);
      return;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.client_reference_id) return;
      await clearPendingCheckout(session.client_reference_id, session.id);
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
