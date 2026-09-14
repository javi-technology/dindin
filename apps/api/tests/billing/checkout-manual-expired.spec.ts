import request from 'supertest';
import { UserSubscription } from 'dindin-shared-types';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const customerCreateMock = jest.fn();
const checkoutCreateMock = jest.fn();
const getSavedSuggestionMock = jest.fn();

// Documento `users/{uid}/billing/subscription` em memória, com `merge`
let storedSubscription: Record<string, unknown> | undefined;
const subscriptionRef = {
  get: jest.fn(async () => ({
    exists: storedSubscription !== undefined,
    data: () => storedSubscription,
  })),
  set: jest.fn(
    async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      storedSubscription = options?.merge
        ? { ...storedSubscription, ...data }
        : data;
    },
  ),
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
    getUser: getUserMock,
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => subscriptionRef),
        })),
      })),
    })),
  })),
  storage: jest.fn(),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    customers: { create: customerCreateMock },
    checkout: { sessions: { create: checkoutCreateMock } },
  })),
}));

jest.mock('../../src/recommended-wallet/ai-suggestion.service', () => ({
  getSavedSuggestion: (...args: unknown[]) => getSavedSuggestionMock(...args),
  generateSuggestion: jest.fn(),
}));

import { app } from '../../src/index';

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const EXPIRED_MANUAL: UserSubscription = {
  status: 'active',
  plan: 'basic',
  interval: null,
  provider: 'manual',
  currentPeriodEnd: PAST,
  cancelAtPeriodEnd: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('checkout abandonado após concessão manual expirada (#173)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_BASIC_MONTHLY = 'price_month';
    process.env.STRIPE_PRICE_BASIC_YEARLY = 'price_year';
    storedSubscription = { ...EXPIRED_MANUAL };
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    getUserMock.mockResolvedValue({ email: 'user@example.com' });
    customerCreateMock.mockResolvedValue({ id: 'cus_new' });
    checkoutCreateMock.mockResolvedValue({ url: 'https://checkout.test' });
    getSavedSuggestionMock.mockResolvedValue({ id: 'suggestion-1' });
  });

  async function openCheckout() {
    const response = await request(app)
      .post('/api/billing/checkout-session')
      .set('Authorization', 'Bearer token')
      .send({ interval: 'month' });
    expect(response.status).toBe(200);
  }

  it('não altera provider nem status e guarda o customer criado', async () => {
    await openCheckout();

    expect(storedSubscription).toMatchObject({
      status: 'active',
      provider: 'manual',
      currentPeriodEnd: PAST,
      providerCustomerId: 'cus_new',
    });
  });

  it('continua sem acesso à IA', async () => {
    await openCheckout();

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/suggestions')
      .query({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    expect(getSavedSuggestionMock).not.toHaveBeenCalled();
  });

  it('continua canceled e sem entitlements em /api/me', async () => {
    await openCheckout();

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.subscription.status).toBe('canceled');
    expect(response.body.entitlements).toEqual([]);
  });

  it('reaproveita o customer ao reabrir o checkout', async () => {
    await openCheckout();
    await openCheckout();

    expect(customerCreateMock).toHaveBeenCalledTimes(1);
    expect(checkoutCreateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ customer: 'cus_new' }),
    );
  });
});
