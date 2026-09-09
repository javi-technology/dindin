import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { AuthRequest } from '../middleware/auth.middleware';
import { getStripe, getPriceId, getAppBaseUrl } from './stripe.client';
import { getOrCreateCustomer } from './stripe-customer.service';
import { getSubscription } from './entitlement.service';
import { processStripeEvent } from './billing.webhook.service';

function sendError(res: Response, context: string, error: unknown): void {
  console.error(`[${context}] error:`, error);
  const status =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (error as Error).message,
  });
}

export async function createCheckoutSession(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { interval } = req.body ?? {};
    if (interval !== 'month' && interval !== 'year') {
      res.status(400).json({ error: 'interval inválido' });
      return;
    }

    const uid = (req as AuthRequest).user!.uid;
    const subscription = await getSubscription(uid);
    // past_due não inicia novo checkout — resolve o pagamento no portal
    if (
      subscription.status === 'active' ||
      subscription.status === 'trialing' ||
      subscription.status === 'past_due'
    ) {
      res.status(409).json({
        error: 'Assinatura já ativa',
        code: 'ALREADY_SUBSCRIBED',
      });
      return;
    }

    let email: string | undefined;
    try {
      email = (await admin.auth().getUser(uid)).email;
    } catch {
      email = undefined;
    }

    const customer = await getOrCreateCustomer(uid, email);
    const base = getAppBaseUrl();
    const session = await getStripe().checkout.sessions.create({
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
    });

    res.json({ url: session.url });
  } catch (error) {
    sendError(res, 'createCheckoutSession', error);
  }
}

export async function createPortalSession(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const uid = (req as AuthRequest).user!.uid;
    const subscription = await getSubscription(uid);
    if (!subscription.providerCustomerId) {
      res
        .status(404)
        .json({ error: 'Cliente não encontrado', code: 'NO_CUSTOMER' });
      return;
    }

    const base = getAppBaseUrl();
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.providerCustomerId,
      return_url: `${base}/assinatura`,
    });

    res.json({ url: session.url });
  } catch (error) {
    sendError(res, 'createPortalSession', error);
  }
}

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  let event: Stripe.Event;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurada');
    event = getStripe().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'] as string,
      secret,
    );
  } catch {
    console.warn('[billing.webhook] assinatura inválida');
    res.status(400).json({ error: 'Assinatura inválida' });
    return;
  }

  const eventDoc = admin.firestore().collection('billingEvents').doc(event.id);

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
