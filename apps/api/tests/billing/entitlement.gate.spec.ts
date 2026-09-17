import request from 'supertest';
import { StripeSubscriptionState, UserSubscription } from 'dindin-shared-types';

const verifyIdTokenMock = jest.fn();
const subscriptionGetMock = jest.fn();
const getSavedSuggestionMock = jest.fn();
const generateSuggestionMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: subscriptionGetMock })),
        })),
      })),
    })),
  })),
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

jest.mock('../../src/recommended-wallet/ai-suggestion.service', () => ({
  getSavedSuggestion: (...args: unknown[]) => getSavedSuggestionMock(...args),
  generateSuggestion: (...args: unknown[]) => generateSuggestionMock(...args),
}));

import { app } from '../../src/index';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function subscriptionDoc(partial: Partial<UserSubscription>) {
  return {
    exists: true,
    data: () => ({
      status: 'none',
      plan: 'basic',
      interval: 'month',
      provider: 'stripe',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: '2026-09-01T00:00:00.000Z',
      ...partial,
    }),
  };
}

function manualWithStripe(
  manual: Partial<UserSubscription>,
  stripe: Partial<StripeSubscriptionState>,
) {
  return subscriptionDoc({
    status: 'active',
    provider: 'manual',
    interval: null,
    currentPeriodEnd: PAST,
    ...manual,
    stripe: {
      status: 'active',
      interval: 'year',
      providerSubscriptionId: 'sub_1',
      currentPeriodEnd: FUTURE,
      cancelAtPeriodEnd: false,
      updatedAt: '2026-09-05T00:00:00.000Z',
      ...stripe,
    },
  });
}

/** Doc gravado antes da #173: checkout aberto sobre concessão manual expirada. */
function abandonedCheckoutDoc() {
  return subscriptionDoc({
    status: 'active',
    interval: null,
    providerSubscriptionId: undefined,
    currentPeriodEnd: PAST,
  });
}

const FORBIDDEN = { error: 'Forbidden', code: 'SUBSCRIPTION_REQUIRED' };

function getSuggestionRequest() {
  return request(app)
    .get('/api/recommended-wallets/bb-fii/suggestions')
    .query({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
    .set('Authorization', 'Bearer token');
}

function postSuggestionRequest() {
  return request(app)
    .post('/api/recommended-wallets/bb-fii/suggestions')
    .send({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
    .set('Authorization', 'Bearer token');
}

describe('gate de assinatura nos endpoints de sugestão IA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    getSavedSuggestionMock.mockResolvedValue({ id: 'suggestion-1' });
    generateSuggestionMock.mockResolvedValue({ id: 'suggestion-1' });
  });

  it('deve responder 403 SUBSCRIPTION_REQUIRED sem documento de assinatura', async () => {
    subscriptionGetMock.mockResolvedValue({ exists: false });

    const get = await getSuggestionRequest();
    expect(get.status).toBe(403);
    expect(get.body).toEqual(FORBIDDEN);

    const post = await postSuggestionRequest();
    expect(post.status).toBe(403);
    expect(post.body).toEqual(FORBIDDEN);

    expect(getSavedSuggestionMock).not.toHaveBeenCalled();
    expect(generateSuggestionMock).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing'] as const)(
    'deve liberar o fluxo com status %s',
    async (status) => {
      subscriptionGetMock.mockResolvedValue(subscriptionDoc({ status }));

      const get = await getSuggestionRequest();
      expect(get.status).toBe(200);
      expect(getSavedSuggestionMock).toHaveBeenCalled();

      const post = await postSuggestionRequest();
      expect(post.status).toBe(201);
      expect(generateSuggestionMock).toHaveBeenCalled();
    },
  );

  it.each([
    ['expira', {}],
    ['é revogada', { status: 'canceled' as const, currentPeriodEnd: FUTURE }],
  ])(
    'deve manter o acesso pela Stripe paga quando a concessão manual %s',
    async (_label, manual) => {
      subscriptionGetMock.mockResolvedValue(manualWithStripe(manual, {}));

      const get = await getSuggestionRequest();
      expect(get.status).toBe(200);
      expect(getSavedSuggestionMock).toHaveBeenCalled();
    },
  );

  it('deve negar quando a Stripe foi cancelada durante a concessão expirada', async () => {
    subscriptionGetMock.mockResolvedValue(
      manualWithStripe({}, { status: 'canceled' }),
    );

    const get = await getSuggestionRequest();
    expect(get.status).toBe(403);
    expect(get.body).toEqual(FORBIDDEN);
  });

  it('deve negar doc marcado como Stripe por checkout abandonado após concessão expirada', async () => {
    subscriptionGetMock.mockResolvedValue(abandonedCheckoutDoc());

    const get = await getSuggestionRequest();
    expect(get.status).toBe(403);
    expect(get.body).toEqual(FORBIDDEN);
    expect(getSavedSuggestionMock).not.toHaveBeenCalled();
  });

  it('deve liberar past_due dentro da carência', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({ status: 'past_due', currentPeriodEnd: FUTURE }),
    );

    const response = await getSuggestionRequest();
    expect(response.status).toBe(200);
  });

  it('deve negar past_due fora da carência', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({ status: 'past_due', currentPeriodEnd: PAST }),
    );

    const response = await getSuggestionRequest();
    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
  });

  it('deve negar assinatura cancelada', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({ status: 'canceled' }),
    );

    const response = await postSuggestionRequest();
    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(generateSuggestionMock).not.toHaveBeenCalled();
  });

  it('deve liberar admin sem assinatura', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    subscriptionGetMock.mockResolvedValue({ exists: false });

    const response = await getSuggestionRequest();
    expect(response.status).toBe(200);
    expect(subscriptionGetMock).not.toHaveBeenCalled();
  });

  it('deve preservar o limite diário de sugestões com assinatura ativa', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({ status: 'active' }),
    );
    generateSuggestionMock.mockRejectedValue(
      Object.assign(new Error('Limite diário atingido'), { statusCode: 429 }),
    );

    const response = await postSuggestionRequest();
    expect(response.status).toBe(429);
  });
});

describe('GET /api/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
  });

  it('deve devolver assinatura none e sem entitlements quando não há doc', async () => {
    subscriptionGetMock.mockResolvedValue({ exists: false });

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      uid: 'user-1',
      admin: false,
      subscription: {
        status: 'none',
        plan: null,
        interval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      entitlements: [],
    });
  });

  it('deve devolver assinatura ativa com entitlement ai e sem ids do provedor', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({ status: 'active', currentPeriodEnd: FUTURE }),
    );

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      uid: 'user-1',
      admin: false,
      subscription: {
        status: 'active',
        plan: 'basic',
        interval: 'month',
        currentPeriodEnd: FUTURE,
        cancelAtPeriodEnd: false,
      },
      entitlements: ['ai', 'projections'],
    });
    expect(JSON.stringify(response.body)).not.toContain('cus_1');
    expect(JSON.stringify(response.body)).not.toContain('sub_1');
  });

  it('não expõe pendingCheckout nem portalRateLimit', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({
        status: 'none',
        pendingCheckout: {
          sessionId: 'cs_secret',
          url: 'https://checkout.test/cs_secret',
          expiresAt: FUTURE,
          interval: 'month',
        },
        portalRateLimit: { windowStart: FUTURE, count: 1 },
      }),
    );

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.subscription).not.toHaveProperty('pendingCheckout');
    expect(response.body.subscription).not.toHaveProperty('portalRateLimit');
    expect(JSON.stringify(response.body)).not.toContain('cs_secret');
  });

  it('deve devolver concessão manual expirada como canceled', async () => {
    subscriptionGetMock.mockResolvedValue(
      subscriptionDoc({
        status: 'active',
        provider: 'manual',
        interval: null,
        currentPeriodEnd: PAST,
      }),
    );

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.subscription.status).toBe('canceled');
    expect(response.body.entitlements).toEqual([]);
  });

  it('deve devolver canceled para doc marcado como Stripe por checkout abandonado', async () => {
    subscriptionGetMock.mockResolvedValue(abandonedCheckoutDoc());

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.subscription.status).toBe('canceled');
    expect(response.body.entitlements).toEqual([]);
  });

  it('deve devolver a Stripe guardada quando a concessão manual expirou', async () => {
    subscriptionGetMock.mockResolvedValue(manualWithStripe({}, {}));

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.subscription).toEqual({
      status: 'active',
      plan: 'basic',
      interval: 'year',
      currentPeriodEnd: FUTURE,
      cancelAtPeriodEnd: false,
    });
    expect(response.body.entitlements).toEqual(['ai', 'projections']);
    expect(JSON.stringify(response.body)).not.toContain('sub_1');
  });

  it('deve devolver entitlement ai para admin sem assinatura', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    subscriptionGetMock.mockResolvedValue({ exists: false });

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.admin).toBe(true);
    expect(response.body.subscription.status).toBe('none');
    expect(response.body.entitlements).toEqual(['ai', 'projections']);
  });
});
