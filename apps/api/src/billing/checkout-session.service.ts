import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { SubscriptionInterval, UserSubscription } from 'dindin-shared-types';
import { getStripe, getPriceId, getAppBaseUrl } from './stripe.client';
import {
  NO_SUBSCRIPTION,
  effectiveStatus,
  resolveSubscription,
  subscriptionDoc,
} from './entitlement.service';

/** Checkout Session aberta para o usuário — interno ao backend (#155). */
export interface PendingCheckout {
  sessionId: string;
  url: string;
  expiresAt: string; // ISO, `expires_at` da sessão
  interval: SubscriptionInterval;
}

/** Campos internos do doc de billing, nunca expostos em `GET /api/me`. */
export type BillingDoc = UserSubscription & {
  pendingCheckout?: PendingCheckout;
  portalRateLimit?: { windowStart: string; count: number };
};

export type CheckoutReservation =
  | { kind: 'url'; url: string }
  | { kind: 'already_subscribed' }
  | { kind: 'in_progress' };

/** Sessões prestes a expirar não são reutilizadas. */
const REUSE_MARGIN_MS = 60 * 1000;
const IDEMPOTENCY_BUCKET_SECONDS = 60 * 60;

export const PORTAL_LIMIT_PER_WINDOW = 5;
export const PORTAL_WINDOW_MS = 60 * 1000;

function isInForce(subscription: UserSubscription): boolean {
  const status = effectiveStatus(subscription);
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/**
 * Reserva uma única Checkout Session por `uid`: dentro da transação no doc de
 * billing, devolve a sessão pendente ainda válida ou cria uma nova e a grava em
 * `pendingCheckout`. A `idempotencyKey` deriva do estado lido, então retries da
 * transação não duplicam a sessão na Stripe.
 */
export async function reserveCheckoutSession(
  uid: string,
  interval: SubscriptionInterval,
  customer: string,
): Promise<CheckoutReservation> {
  const ref = subscriptionDoc(uid);
  return admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const doc = {
      ...NO_SUBSCRIPTION,
      ...((snapshot.data() as Partial<BillingDoc> | undefined) ?? {}),
    } as BillingDoc;
    const subscription = resolveSubscription(doc);
    if (isInForce(subscription)) return { kind: 'already_subscribed' };

    const now = Date.now();
    const pending = doc.pendingCheckout;
    const pendingValid =
      !!pending &&
      new Date(pending.expiresAt).getTime() > now + REUSE_MARGIN_MS;

    if (pending && pendingValid && pending.interval === interval) {
      return { kind: 'url', url: pending.url };
    }

    const stripe = getStripe();
    if (pending && pendingValid) {
      // Troca de intervalo: a sessão anterior é encerrada para não haver duas
      // abertas. Se já foi concluída, o webhook ainda vai gravar a assinatura.
      try {
        await stripe.checkout.sessions.expire(pending.sessionId);
      } catch (error) {
        console.warn(
          '[billing.checkout] não foi possível expirar sessão pendente',
          uid,
          pending.sessionId,
          (error as Error).message,
        );
        return { kind: 'in_progress' };
      }
    }

    const bucket = Math.floor(now / 1000 / IDEMPOTENCY_BUCKET_SECONDS);
    const idempotencyKey = [
      'checkout',
      uid,
      interval,
      subscription.providerSubscriptionId ?? 'first',
      pending?.sessionId ?? 'none',
      bucket,
    ].join(':');

    const base = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer,
        client_reference_id: uid,
        line_items: [{ price: getPriceId(interval), quantity: 1 }],
        // Trial apenas na primeira assinatura — ex-assinantes não repetem
        subscription_data: {
          ...(subscription.providerSubscriptionId
            ? {}
            : { trial_period_days: 7 }),
          metadata: { uid },
        },
        success_url: `${base}/assinatura?status=success`,
        cancel_url: `${base}/assinatura?status=cancel`,
        locale: 'pt-BR',
        allow_promotion_codes: false,
      },
      { idempotencyKey },
    );

    const pendingCheckout: PendingCheckout = {
      sessionId: session.id,
      url: session.url as string,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      interval,
    };
    tx.set(ref, { pendingCheckout }, { merge: true });
    return { kind: 'url', url: pendingCheckout.url };
  });
}

/** Remove `pendingCheckout` só se ainda for a sessão informada. */
export async function clearPendingCheckout(
  uid: string,
  sessionId: string,
): Promise<void> {
  const ref = subscriptionDoc(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as BillingDoc | undefined;
    if (current?.pendingCheckout?.sessionId !== sessionId) return;
    tx.set(ref, { pendingCheckout: FieldValue.delete() }, { merge: true });
  });
}

/**
 * Consome uma sessão do portal na janela fixa de 1 minuto do usuário.
 * Devolve `null` quando permitido ou os segundos até liberar novamente.
 */
export async function consumePortalQuota(uid: string): Promise<number | null> {
  const ref = subscriptionDoc(uid);
  return admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = (snapshot.data() as BillingDoc | undefined)
      ?.portalRateLimit;
    const now = Date.now();
    const windowStartMs = current ? new Date(current.windowStart).getTime() : 0;
    const inWindow = !!current && now - windowStartMs < PORTAL_WINDOW_MS;

    if (inWindow && current.count >= PORTAL_LIMIT_PER_WINDOW) {
      return Math.ceil((windowStartMs + PORTAL_WINDOW_MS - now) / 1000);
    }

    const portalRateLimit = inWindow
      ? { windowStart: current.windowStart, count: current.count + 1 }
      : { windowStart: new Date(now).toISOString(), count: 1 };
    tx.set(ref, { portalRateLimit }, { merge: true });
    return null;
  });
}
