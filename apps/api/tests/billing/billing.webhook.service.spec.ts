import type Stripe from 'stripe';

const txGetMock = jest.fn();
const txSetMock = jest.fn();
const runTransactionMock = jest.fn(async (cb: (tx: unknown) => unknown) =>
  cb({ get: txGetMock, set: txSetMock }),
);
const docPathMock = jest.fn();
const subscriptionsRetrieveMock = jest.fn();
const customersRetrieveMock = jest.fn();
const mockStripe = {
  subscriptions: { retrieve: subscriptionsRetrieveMock },
  customers: { retrieve: customersRetrieveMock },
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn((c1: string) => ({
      doc: jest.fn((d1: string) => ({
        collection: jest.fn((c2: string) => ({
          doc: jest.fn((d2: string) => {
            docPathMock(c1, d1, c2, d2);
            return {};
          }),
        })),
      })),
    })),
    runTransaction: runTransactionMock,
  })),
  storage: jest.fn(),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripe),
}));

import { processStripeEvent } from '../../src/billing/billing.webhook.service';

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

function makeEvent(
  type: string,
  object: unknown,
  created = 2000,
): Stripe.Event {
  return {
    id: 'evt_1',
    type,
    created,
    data: { object },
  } as unknown as Stripe.Event;
}

describe('processStripeEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    subscriptionsRetrieveMock.mockResolvedValue(makeSubscription());
    runTransactionMock.mockImplementation(
      async (cb: (tx: unknown) => unknown) =>
        cb({ get: txGetMock, set: txSetMock }),
    );
    txGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    txSetMock.mockResolvedValue(undefined);
  });

  it('checkout.session.completed faz upsert pelo client_reference_id', async () => {
    const session = {
      mode: 'subscription',
      subscription: 'sub_1',
      client_reference_id: 'user-9',
    };

    await processStripeEvent(makeEvent('checkout.session.completed', session));

    expect(subscriptionsRetrieveMock).toHaveBeenCalledWith('sub_1');
    expect(docPathMock).toHaveBeenCalledWith(
      'users',
      'user-9',
      'billing',
      'subscription',
    );
    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'active',
        plan: 'basic',
        interval: 'month',
        provider: 'stripe',
        providerCustomerId: 'cus_1',
        providerSubscriptionId: 'sub_1',
        currentPeriodEnd: '2030-01-01T00:00:00.000Z',
        providerEventCreated: 2000,
      }),
      { merge: true },
    );
  });

  it('ignora checkout.session.completed com mode diferente de subscription', async () => {
    const session = { mode: 'payment', subscription: null };

    await processStripeEvent(makeEvent('checkout.session.completed', session));

    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it.each(['customer.subscription.created', 'customer.subscription.updated'])(
    '%s faz upsert pelo metadata.uid',
    async (type) => {
      await processStripeEvent(makeEvent(type, makeSubscription()));

      expect(txSetMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'active',
          providerEventCreated: 2000,
        }),
        { merge: true },
      );
      expect(docPathMock).toHaveBeenCalledWith(
        'users',
        'user-1',
        'billing',
        'subscription',
      );
    },
  );

  it('customer.subscription.deleted força status canceled', async () => {
    await processStripeEvent(
      makeEvent('customer.subscription.deleted', makeSubscription()),
    );

    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'canceled' }),
      { merge: true },
    );
  });

  it('busca uid no customer quando a assinatura não tem metadata.uid', async () => {
    customersRetrieveMock.mockResolvedValue({
      id: 'cus_1',
      metadata: { uid: 'user-7' },
    });
    const sub = makeSubscription({ metadata: {} });

    await processStripeEvent(makeEvent('customer.subscription.updated', sub));

    expect(customersRetrieveMock).toHaveBeenCalledWith('cus_1');
    expect(docPathMock).toHaveBeenCalledWith(
      'users',
      'user-7',
      'billing',
      'subscription',
    );
    expect(txSetMock).toHaveBeenCalled();
  });

  it('não escreve nada quando uid não é encontrado', async () => {
    customersRetrieveMock.mockResolvedValue({ id: 'cus_1', metadata: {} });

    await processStripeEvent(
      makeEvent(
        'customer.subscription.updated',
        makeSubscription({ metadata: {} }),
      ),
    );

    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('invoice.paid atualiza a assinatura via parent.subscription_details', async () => {
    const invoice = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_1' },
      },
    };

    await processStripeEvent(makeEvent('invoice.paid', invoice));

    expect(subscriptionsRetrieveMock).toHaveBeenCalledWith('sub_1');
    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'active' }),
      { merge: true },
    );
  });

  it('invoice.payment_failed força status past_due', async () => {
    const invoice = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_1' },
      },
    };

    await processStripeEvent(makeEvent('invoice.payment_failed', invoice));

    expect(txSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'past_due' }),
      { merge: true },
    );
  });

  it('ignora invoice sem assinatura', async () => {
    const invoice = { parent: null };

    await processStripeEvent(makeEvent('invoice.paid', invoice));

    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('ignora tipos de evento desconhecidos', async () => {
    await processStripeEvent(makeEvent('payment_intent.succeeded', {}));

    expect(txSetMock).not.toHaveBeenCalled();
  });

  describe('eventos fora de ordem', () => {
    const stored = (providerEventCreated: number) => ({
      exists: true,
      data: () => ({ providerEventCreated }),
    });

    it('ignora evento mais antigo que o já gravado', async () => {
      txGetMock.mockResolvedValue(stored(3000));

      await processStripeEvent(
        makeEvent('customer.subscription.updated', makeSubscription(), 2000),
      );

      expect(txSetMock).not.toHaveBeenCalled();
    });

    it('grava evento igual ao já gravado', async () => {
      txGetMock.mockResolvedValue(stored(2000));

      await processStripeEvent(
        makeEvent('customer.subscription.updated', makeSubscription(), 2000),
      );

      expect(txSetMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ providerEventCreated: 2000 }),
        { merge: true },
      );
    });

    it('grava evento mais novo que o já gravado', async () => {
      txGetMock.mockResolvedValue(stored(1000));

      await processStripeEvent(
        makeEvent('customer.subscription.updated', makeSubscription(), 2000),
      );

      expect(txSetMock).toHaveBeenCalled();
    });

    it('grava quando o doc não tem providerEventCreated', async () => {
      txGetMock.mockResolvedValue({
        exists: true,
        data: () => ({ status: 'active' }),
      });

      await processStripeEvent(
        makeEvent('customer.subscription.updated', makeSubscription(), 2000),
      );

      expect(txSetMock).toHaveBeenCalled();
    });
  });
});
