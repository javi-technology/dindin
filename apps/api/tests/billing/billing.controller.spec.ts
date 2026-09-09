import request from 'supertest';
import type Stripe from 'stripe';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const subGetMock = jest.fn();
const subSetMock = jest.fn();
const txGetMock = jest.fn();
const txSetMock = jest.fn();
const runTransactionMock = jest.fn(async (cb: (tx: unknown) => unknown) =>
  cb({ get: txGetMock, set: txSetMock }),
);
const eventGetMock = jest.fn();
const eventSetMock = jest.fn();
const eventDocIdMock = jest.fn();

const customerCreateMock = jest.fn();
const customerRetrieveMock = jest.fn();
const checkoutCreateMock = jest.fn();
const portalCreateMock = jest.fn();
const subscriptionsRetrieveMock = jest.fn();
const constructEventMock = jest.fn();
const mockStripe = {
  customers: {
    create: customerCreateMock,
    retrieve: customerRetrieveMock,
  },
  checkout: { sessions: { create: checkoutCreateMock } },
  billingPortal: { sessions: { create: portalCreateMock } },
  subscriptions: { retrieve: subscriptionsRetrieveMock },
  webhooks: { constructEvent: constructEventMock },
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
    getUser: getUserMock,
  })),
  firestore: jest.fn(() => ({
    runTransaction: runTransactionMock,
    collection: jest.fn((name: string) => ({
      doc: jest.fn((id: string) => {
        if (name === 'billingEvents') {
          eventDocIdMock(id);
          return { get: eventGetMock, set: eventSetMock };
        }
        return {
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({ get: subGetMock, set: subSetMock })),
          })),
        };
      }),
    })),
  })),
  storage: jest.fn(),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripe),
}));

import { app } from '../../src/index';

function makeSubscription(
  partial: Record<string, unknown> = {},
): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    metadata: { uid: 'user-1' },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          current_period_end: 1893456000,
          price: { id: 'price_1', recurring: { interval: 'month' } },
        },
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
    ...partial,
  } as unknown as Stripe.Subscription;
}

function subscriptionDoc(partial: Record<string, unknown>) {
  return { exists: true, data: () => partial };
}

function postWebhook(payload: string) {
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'sig_1')
    .send(payload);
}

describe('billing controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    process.env.STRIPE_PRICE_BASIC_MONTHLY = 'price_month';
    process.env.STRIPE_PRICE_BASIC_YEARLY = 'price_year';
    delete process.env.APP_BASE_URL;

    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    getUserMock.mockResolvedValue({ email: 'user@example.com' });
    subGetMock.mockResolvedValue({ exists: false });
    subSetMock.mockResolvedValue(undefined);
    eventGetMock.mockResolvedValue({ exists: false });
    eventSetMock.mockResolvedValue(undefined);
    runTransactionMock.mockImplementation(
      async (cb: (tx: unknown) => unknown) =>
        cb({ get: txGetMock, set: txSetMock }),
    );
    txGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    txSetMock.mockResolvedValue(undefined);
    customerCreateMock.mockResolvedValue({ id: 'cus_1' });
    checkoutCreateMock.mockResolvedValue({ url: 'https://checkout.test' });
    portalCreateMock.mockResolvedValue({ url: 'https://portal.test' });
    subscriptionsRetrieveMock.mockResolvedValue(makeSubscription());
  });

  describe('POST /api/billing/checkout-session', () => {
    it('cria sessão de checkout com trial de 7 dias', async () => {
      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'month' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://checkout.test' });
      expect(customerCreateMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        metadata: { uid: 'user-1' },
      });
      expect(checkoutCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_1',
          client_reference_id: 'user-1',
          line_items: [{ price: 'price_month', quantity: 1 }],
          subscription_data: {
            trial_period_days: 7,
            metadata: { uid: 'user-1' },
          },
          success_url: 'https://dindin-4e720.web.app/assinatura?status=success',
          cancel_url: 'https://dindin-4e720.web.app/assinatura?status=cancel',
          locale: 'pt-BR',
          allow_promotion_codes: false,
        }),
      );
    });

    it('usa o price anual quando interval=year', async () => {
      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'year' });

      expect(response.status).toBe(200);
      expect(checkoutCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_year', quantity: 1 }],
        }),
      );
    });

    it('responde 400 com interval inválido', async () => {
      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'week' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'interval inválido' });
      expect(checkoutCreateMock).not.toHaveBeenCalled();
    });

    it.each(['active', 'trialing', 'past_due'])(
      'responde 409 quando a assinatura já está %s',
      async (status) => {
        subGetMock.mockResolvedValue(subscriptionDoc({ status }));

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: 'Assinatura já ativa',
          code: 'ALREADY_SUBSCRIBED',
        });
        expect(checkoutCreateMock).not.toHaveBeenCalled();
      },
    );

    it('não concede trial para ex-assinante cancelado', async () => {
      subGetMock.mockResolvedValue(
        subscriptionDoc({
          status: 'canceled',
          providerCustomerId: 'cus_1',
          providerSubscriptionId: 'sub_old',
        }),
      );

      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'month' });

      expect(response.status).toBe(200);
      const params = checkoutCreateMock.mock.calls[0][0];
      expect(params.subscription_data).toEqual({ metadata: { uid: 'user-1' } });
      expect('trial_period_days' in params.subscription_data).toBe(false);
      expect(customerCreateMock).not.toHaveBeenCalled();
    });

    it('ignora o header Origin nas URLs de retorno', async () => {
      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .set('Origin', 'https://evil.example')
        .send({ interval: 'month' });

      expect(response.status).toBe(200);
      expect(checkoutCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://dindin-4e720.web.app/assinatura?status=success',
          cancel_url: 'https://dindin-4e720.web.app/assinatura?status=cancel',
        }),
      );

      subGetMock.mockResolvedValue(
        subscriptionDoc({ providerCustomerId: 'cus_1' }),
      );
      const portal = await request(app)
        .post('/api/billing/portal-session')
        .set('Authorization', 'Bearer token')
        .set('Origin', 'https://evil.example')
        .send({});

      expect(portal.status).toBe(200);
      expect(portalCreateMock).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://dindin-4e720.web.app/assinatura',
      });
    });

    it('segue sem email quando getUser falha', async () => {
      getUserMock.mockRejectedValue(new Error('not found'));

      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'month' });

      expect(response.status).toBe(200);
      expect(customerCreateMock).toHaveBeenCalledWith({
        email: undefined,
        metadata: { uid: 'user-1' },
      });
    });
  });

  describe('POST /api/billing/portal-session', () => {
    it('cria sessão do portal para cliente existente', async () => {
      subGetMock.mockResolvedValue(
        subscriptionDoc({ providerCustomerId: 'cus_1' }),
      );

      const response = await request(app)
        .post('/api/billing/portal-session')
        .set('Authorization', 'Bearer token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://portal.test' });
      expect(portalCreateMock).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://dindin-4e720.web.app/assinatura',
      });
    });

    it('responde 404 sem customer', async () => {
      const response = await request(app)
        .post('/api/billing/portal-session')
        .set('Authorization', 'Bearer token')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Cliente não encontrado',
        code: 'NO_CUSTOMER',
      });
      expect(portalCreateMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/billing/webhook', () => {
    const event = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: { __sub: true } },
    };

    it('responde 400 com assinatura inválida', async () => {
      constructEventMock.mockImplementation(() => {
        throw new Error('bad sig');
      });

      const response = await postWebhook(JSON.stringify(event));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Assinatura inválida' });
      expect(eventSetMock).not.toHaveBeenCalled();
    });

    it('processa evento válido e registra billingEvents', async () => {
      constructEventMock.mockReturnValue({
        ...event,
        data: { object: makeSubscription() },
      });

      const response = await postWebhook(JSON.stringify(event));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(constructEventMock).toHaveBeenCalledWith(
        expect.any(Buffer),
        'sig_1',
        'whsec_123',
      );
      expect(eventDocIdMock).toHaveBeenCalledWith('evt_1');
      expect(eventSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customer.subscription.updated' }),
      );
      expect(txSetMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'active', provider: 'stripe' }),
        { merge: true },
      );
    });

    it('funciona sem header Authorization', async () => {
      constructEventMock.mockReturnValue({
        ...event,
        data: { object: makeSubscription() },
      });

      const response = await postWebhook(JSON.stringify(event));

      expect(response.status).toBe(200);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
    });

    it('responde 200 duplicado sem reprocessar', async () => {
      constructEventMock.mockReturnValue(event);
      eventGetMock.mockResolvedValue({ exists: true });

      const response = await postWebhook(JSON.stringify(event));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true, duplicate: true });
      expect(txSetMock).not.toHaveBeenCalled();
      expect(eventSetMock).not.toHaveBeenCalled();
    });

    it('responde 200 mesmo se registrar o evento falhar', async () => {
      constructEventMock.mockReturnValue({
        ...event,
        data: { object: makeSubscription() },
      });
      eventSetMock.mockRejectedValue(new Error('firestore down'));

      const response = await postWebhook(JSON.stringify(event));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });
});
