import request from 'supertest';
import express, { Request } from 'express';
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
const checkoutExpireMock = jest.fn();
const checkoutRetrieveMock = jest.fn();
const portalCreateMock = jest.fn();
const subscriptionsRetrieveMock = jest.fn();
const constructEventMock = jest.fn();
const mockStripe = {
  customers: {
    create: customerCreateMock,
    retrieve: customerRetrieveMock,
  },
  checkout: {
    sessions: {
      create: checkoutCreateMock,
      expire: checkoutExpireMock,
      retrieve: checkoutRetrieveMock,
    },
  },
  billingPortal: { sessions: { create: portalCreateMock } },
  subscriptions: { retrieve: subscriptionsRetrieveMock },
  webhooks: { constructEvent: constructEventMock },
};

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
    getUser: getUserMock,
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({
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
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripe),
}));

import { app } from '../../src/index';
import { handleWebhook } from '../../src/billing/billing.controller';

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
    checkoutCreateMock.mockResolvedValue({
      id: 'cs_1',
      url: 'https://checkout.test',
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });
    checkoutExpireMock.mockResolvedValue({ id: 'cs_old', status: 'expired' });
    checkoutRetrieveMock.mockResolvedValue({ id: 'cs_old', status: 'open' });
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
        { idempotencyKey: expect.stringMatching(/^checkout:user-1:month:/) },
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
        expect.anything(),
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

    it('permite checkout quando a concessão manual expirou', async () => {
      subGetMock.mockResolvedValue(
        subscriptionDoc({
          status: 'active',
          provider: 'manual',
          currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
        }),
      );

      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'month' });

      expect(response.status).toBe(200);
      expect(checkoutCreateMock).toHaveBeenCalled();
    });

    it('responde 409 quando a concessão manual está vigente', async () => {
      subGetMock.mockResolvedValue(
        subscriptionDoc({
          status: 'active',
          provider: 'manual',
          currentPeriodEnd: null,
        }),
      );

      const response = await request(app)
        .post('/api/billing/checkout-session')
        .set('Authorization', 'Bearer token')
        .send({ interval: 'month' });

      expect(response.status).toBe(409);
      expect(checkoutCreateMock).not.toHaveBeenCalled();
    });

    it.each(['active', 'trialing', 'past_due'])(
      'responde 409 quando a Stripe guardada sob concessão expirada está %s',
      async (status) => {
        subGetMock.mockResolvedValue(
          subscriptionDoc({
            status: 'active',
            provider: 'manual',
            providerCustomerId: 'cus_1',
            currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
            stripe: {
              status,
              interval: 'month',
              providerSubscriptionId: 'sub_1',
              currentPeriodEnd: new Date(Date.now() - 1000).toISOString(),
              cancelAtPeriodEnd: false,
              updatedAt: '2026-09-05T00:00:00.000Z',
            },
          }),
        );

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('ALREADY_SUBSCRIBED');
        expect(checkoutCreateMock).not.toHaveBeenCalled();
      },
    );

    it('não concede trial para ex-assinante cancelado', async () => {
      const doc = subscriptionDoc({
        status: 'canceled',
        providerCustomerId: 'cus_1',
        providerSubscriptionId: 'sub_old',
      });
      subGetMock.mockResolvedValue(doc);
      txGetMock.mockResolvedValue(doc);

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
        expect.anything(),
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

    describe('reserva por usuário', () => {
      const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

      function pendingDoc(pendingCheckout: Record<string, unknown>) {
        return {
          exists: true,
          data: () => ({ status: 'none', pendingCheckout }),
        };
      }

      it('chamadas concorrentes devolvem a mesma url e criam uma única sessão', async () => {
        // Simula o isolamento do Firestore: transações serializadas sobre o doc.
        let stored: Record<string, unknown> | undefined;
        let queue: Promise<unknown> = Promise.resolve();
        runTransactionMock.mockImplementation(
          (cb: (tx: unknown) => unknown) => {
            const run = queue.then(() =>
              cb({
                get: async () => ({
                  exists: stored !== undefined,
                  data: () => stored,
                }),
                set: (_ref: unknown, data: Record<string, unknown>) => {
                  stored = { ...(stored ?? {}), ...data };
                },
              }),
            );
            queue = run.catch(() => undefined);
            return run;
          },
        );
        checkoutCreateMock.mockImplementation(async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return {
            id: 'cs_1',
            url: 'https://checkout.test/cs_1',
            expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          };
        });

        const send = () =>
          request(app)
            .post('/api/billing/checkout-session')
            .set('Authorization', 'Bearer token')
            .send({ interval: 'month' });
        const [first, second] = await Promise.all([send(), send()]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.body).toEqual({ url: 'https://checkout.test/cs_1' });
        expect(second.body).toEqual({ url: 'https://checkout.test/cs_1' });
        expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
        expect(stored?.pendingCheckout).toEqual({
          sessionId: 'cs_1',
          url: 'https://checkout.test/cs_1',
          expiresAt: expect.any(String),
          interval: 'month',
        });
      });

      it('grava pendingCheckout com expiresAt da sessão', async () => {
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        checkoutCreateMock.mockResolvedValue({
          id: 'cs_9',
          url: 'https://checkout.test/cs_9',
          expires_at: expiresAt,
        });

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'year' });

        expect(response.status).toBe(200);
        expect(txSetMock).toHaveBeenCalledWith(
          expect.anything(),
          {
            pendingCheckout: {
              sessionId: 'cs_9',
              url: 'https://checkout.test/cs_9',
              expiresAt: new Date(expiresAt * 1000).toISOString(),
              interval: 'year',
            },
          },
          { merge: true },
        );
      });

      it('reutiliza pendingCheckout não expirado do mesmo intervalo', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: FUTURE(),
            interval: 'month',
          }),
        );

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ url: 'https://checkout.test/cs_old' });
        expect(checkoutCreateMock).not.toHaveBeenCalled();
        expect(txSetMock).not.toHaveBeenCalled();
      });

      it('cria nova sessão quando pendingCheckout expirou', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: new Date(Date.now() - 1000).toISOString(),
            interval: 'month',
          }),
        );

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ url: 'https://checkout.test' });
        expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
        expect(checkoutExpireMock).not.toHaveBeenCalled();
      });

      it('expira a sessão pendente de outro intervalo antes de criar a nova', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: FUTURE(),
            interval: 'month',
          }),
        );

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'year' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ url: 'https://checkout.test' });
        expect(checkoutExpireMock).toHaveBeenCalledWith('cs_old');
        expect(checkoutCreateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_year', quantity: 1 }],
          }),
          { idempotencyKey: expect.stringMatching(/^checkout:user-1:year:/) },
        );
      });

      it('responde 409 CHECKOUT_IN_PROGRESS quando a sessão anterior não pode ser expirada', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: FUTURE(),
            interval: 'month',
          }),
        );
        checkoutExpireMock.mockRejectedValue(
          new Error('session is already complete'),
        );
        checkoutRetrieveMock.mockResolvedValue({
          id: 'cs_old',
          status: 'complete',
        });

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'year' });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: 'Checkout em andamento',
          code: 'CHECKOUT_IN_PROGRESS',
        });
        expect(checkoutCreateMock).not.toHaveBeenCalled();
      });

      it('segue com a nova sessão quando a anterior já estava expirada na Stripe', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: FUTURE(),
            interval: 'month',
          }),
        );
        checkoutExpireMock.mockRejectedValue(
          new Error('This Checkout Session is already expired'),
        );
        checkoutRetrieveMock.mockResolvedValue({
          id: 'cs_old',
          status: 'expired',
        });

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'year' });

        expect(checkoutRetrieveMock).toHaveBeenCalledWith('cs_old');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ url: 'https://checkout.test' });
        expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
      });

      it('responde 409 CHECKOUT_IN_PROGRESS quando não consegue consultar a sessão anterior', async () => {
        txGetMock.mockResolvedValue(
          pendingDoc({
            sessionId: 'cs_old',
            url: 'https://checkout.test/cs_old',
            expiresAt: FUTURE(),
            interval: 'month',
          }),
        );
        checkoutExpireMock.mockRejectedValue(new Error('network'));
        checkoutRetrieveMock.mockRejectedValue(new Error('network'));

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'year' });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('CHECKOUT_IN_PROGRESS');
        expect(checkoutCreateMock).not.toHaveBeenCalled();
      });

      it('responde 409 quando a assinatura ficou ativa antes da reserva', async () => {
        txGetMock.mockResolvedValue({
          exists: true,
          data: () => ({
            status: 'active',
            provider: 'stripe',
            providerSubscriptionId: 'sub_1',
          }),
        });

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('ALREADY_SUBSCRIBED');
        expect(checkoutCreateMock).not.toHaveBeenCalled();
      });

      it('mantém a idempotencyKey quando a transação é reexecutada', async () => {
        runTransactionMock.mockImplementation(
          async (cb: (tx: unknown) => unknown) => {
            // Primeira tentativa abortada por contenção; o Firestore reexecuta.
            await cb({ get: txGetMock, set: txSetMock });
            return cb({ get: txGetMock, set: txSetMock });
          },
        );

        const response = await request(app)
          .post('/api/billing/checkout-session')
          .set('Authorization', 'Bearer token')
          .send({ interval: 'month' });

        expect(response.status).toBe(200);
        const [[, first], [, second]] = checkoutCreateMock.mock.calls;
        expect(first.idempotencyKey).toBe(second.idempotencyKey);
      });

      it('usa idempotencyKey nova em cada requisição sem reserva', async () => {
        // pendingCheckout removido entre as chamadas (ex.: webhook), na mesma hora
        for (let i = 0; i < 2; i++) {
          await request(app)
            .post('/api/billing/checkout-session')
            .set('Authorization', 'Bearer token')
            .send({ interval: 'month' });
        }

        const [[, first], [, second]] = checkoutCreateMock.mock.calls;
        expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
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

    it('cria sessão do portal durante concessão manual com customer gravado', async () => {
      subGetMock.mockResolvedValue(
        subscriptionDoc({
          status: 'active',
          provider: 'manual',
          currentPeriodEnd: null,
          providerCustomerId: 'cus_1',
          stripe: {
            status: 'active',
            interval: 'month',
            providerSubscriptionId: 'sub_1',
            currentPeriodEnd: '2999-01-01T00:00:00.000Z',
            cancelAtPeriodEnd: false,
            updatedAt: '2026-09-05T00:00:00.000Z',
          },
        }),
      );

      const response = await request(app)
        .post('/api/billing/portal-session')
        .set('Authorization', 'Bearer token')
        .send({});

      expect(response.status).toBe(200);
      expect(portalCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_1' }),
      );
    });

    describe('limite por usuário', () => {
      beforeEach(() => {
        subGetMock.mockResolvedValue(
          subscriptionDoc({ providerCustomerId: 'cus_1' }),
        );
      });

      function limitDoc(count: number, windowStart: string) {
        return {
          exists: true,
          data: () => ({
            providerCustomerId: 'cus_1',
            portalRateLimit: { windowStart, count },
          }),
        };
      }

      it('contabiliza a sessão criada na janela atual', async () => {
        const windowStart = new Date(Date.now() - 10_000).toISOString();
        txGetMock.mockResolvedValue(limitDoc(2, windowStart));

        const response = await request(app)
          .post('/api/billing/portal-session')
          .set('Authorization', 'Bearer token')
          .send({});

        expect(response.status).toBe(200);
        expect(txSetMock).toHaveBeenCalledWith(
          expect.anything(),
          { portalRateLimit: { windowStart, count: 3 } },
          { merge: true },
        );
      });

      it('responde 429 acima de 5 sessões por minuto', async () => {
        txGetMock.mockResolvedValue(
          limitDoc(5, new Date(Date.now() - 10_000).toISOString()),
        );

        const response = await request(app)
          .post('/api/billing/portal-session')
          .set('Authorization', 'Bearer token')
          .send({});

        expect(response.status).toBe(429);
        expect(response.body).toEqual({
          error: 'Muitas requisições, tente novamente em instantes',
          code: 'RATE_LIMITED',
        });
        expect(response.headers['retry-after']).toBeDefined();
        expect(portalCreateMock).not.toHaveBeenCalled();
      });

      it('reinicia a janela após 1 minuto', async () => {
        txGetMock.mockResolvedValue(
          limitDoc(5, new Date(Date.now() - 61_000).toISOString()),
        );

        const response = await request(app)
          .post('/api/billing/portal-session')
          .set('Authorization', 'Bearer token')
          .send({});

        expect(response.status).toBe(200);
        expect(txSetMock).toHaveBeenCalledWith(
          expect.anything(),
          { portalRateLimit: { windowStart: expect.any(String), count: 1 } },
          { merge: true },
        );
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

    it('usa req.rawBody quando o corpo já foi parseado pelo Functions', async () => {
      constructEventMock.mockReturnValue({
        ...event,
        data: { object: makeSubscription() },
      });
      const payload = JSON.stringify(event);

      // Simula o Functions v2: o corpo chega já parseado e os bytes
      // originais ficam disponíveis apenas em req.rawBody.
      const functionsApp = express();
      functionsApp.post(
        '/api/billing/webhook',
        (req: Request, _res, next) => {
          (req as Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(payload);
          req.body = JSON.parse(payload);
          next();
        },
        handleWebhook,
      );

      const response = await request(functionsApp)
        .post('/api/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'sig_1')
        .send(payload);

      expect(response.status).toBe(200);
      expect(constructEventMock).toHaveBeenCalledWith(
        Buffer.from(payload),
        'sig_1',
        'whsec_123',
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
