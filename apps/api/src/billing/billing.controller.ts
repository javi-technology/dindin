import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type Stripe from 'stripe';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/async-handler';
import { getStripe, getAppBaseUrl } from './stripe.client';
import { getOrCreateCustomer } from './stripe-customer.service';
import { getSubscription } from './entitlement.service';
import { processStripeEvent } from './billing.webhook.service';
import {
  consumePortalQuota,
  isInForce,
  reserveCheckoutSession,
} from './checkout-session.service';

function sendAlreadySubscribed(res: Response): void {
  res.status(409).json({
    error: 'Assinatura já ativa',
    code: 'ALREADY_SUBSCRIBED',
  });
}

export const createCheckoutSession = asyncHandler(
  'createCheckoutSession',
  async (req: Request, res: Response) => {
    const { interval } = req.body ?? {};
    if (interval !== 'month' && interval !== 'year') {
      res.status(400).json({ error: 'interval inválido' });
      return;
    }

    const uid = (req as AuthRequest).user!.uid;
    if (isInForce(await getSubscription(uid))) {
      sendAlreadySubscribed(res);
      return;
    }

    let email: string | undefined;
    try {
      email = (await getAuth().getUser(uid)).email;
    } catch {
      email = undefined;
    }

    const customer = await getOrCreateCustomer(uid, email);
    // Revalida o status na transação: o webhook pode ter ativado a assinatura
    const reservation = await reserveCheckoutSession(uid, interval, customer);
    if (reservation.kind === 'already_subscribed') {
      sendAlreadySubscribed(res);
      return;
    }
    if (reservation.kind === 'in_progress') {
      res.status(409).json({
        error: 'Checkout em andamento',
        code: 'CHECKOUT_IN_PROGRESS',
      });
      return;
    }

    res.json({ url: reservation.url });
  },
);

export const createPortalSession = asyncHandler(
  'createPortalSession',
  async (req: Request, res: Response) => {
    const uid = (req as AuthRequest).user!.uid;
    const subscription = await getSubscription(uid);
    if (!subscription.providerCustomerId) {
      res
        .status(404)
        .json({ error: 'Cliente não encontrado', code: 'NO_CUSTOMER' });
      return;
    }

    const retryAfter = await consumePortalQuota(uid);
    if (retryAfter !== null) {
      res.status(429).set('Retry-After', String(retryAfter)).json({
        error: 'Muitas requisições, tente novamente em instantes',
        code: 'RATE_LIMITED',
      });
      return;
    }

    const base = getAppBaseUrl();
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.providerCustomerId,
      return_url: `${base}/assinatura`,
    });

    res.json({ url: session.url });
  },
);

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  let event: Stripe.Event;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurada');
    // No Functions v2 o corpo já chega parseado; os bytes originais
    // necessários para validar a assinatura ficam em req.rawBody.
    const payload = (req as Request & { rawBody?: Buffer }).rawBody ?? req.body;
    event = getStripe().webhooks.constructEvent(
      payload,
      req.headers['stripe-signature'] as string,
      secret,
    );
  } catch {
    console.warn('[billing.webhook] assinatura inválida');
    res.status(400).json({ error: 'Assinatura inválida' });
    return;
  }

  const eventDoc = getFirestore().collection('billingEvents').doc(event.id);

  try {
    const snapshot = await eventDoc.get();
    if (snapshot.exists) {
      res.json({ received: true, duplicate: true });
      return;
    }
  } catch (error) {
    console.error('[billing.webhook] erro ao consultar billingEvents', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  try {
    await processStripeEvent(event);
  } catch (error) {
    console.error('[billing.webhook]', event.type, (error as Error).message);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const now = new Date().toISOString();
  try {
    await eventDoc.set({
      type: event.type,
      createdAt: now,
      processedAt: now,
    });
  } catch (error) {
    // O processamento já ocorreu — falhar aqui faria a Stripe retentar o
    // evento, o que é inócuo, mas respondemos 200 para não gerar ruído.
    console.error(
      '[billing.webhook] falha ao registrar evento',
      event.id,
      (error as Error).message,
    );
  }
  res.json({ received: true });
}
