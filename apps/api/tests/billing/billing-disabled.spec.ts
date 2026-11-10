import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const subscriptionGetMock = jest.fn();
const getSavedSuggestionMock = jest.fn();
const registerStorePurchaseMock = jest.fn();
const getOrCreateCustomerMock = jest.fn();

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
  generateSuggestion: jest.fn(),
}));

jest.mock('../../src/billing/store/store-purchase.service', () => ({
  ...jest.requireActual('../../src/billing/store/store-purchase.service'),
  registerStorePurchase: (...args: unknown[]) =>
    registerStorePurchaseMock(...args),
}));

jest.mock('../../src/billing/stripe-customer.service', () => ({
  getOrCreateCustomer: (...args: unknown[]) => getOrCreateCustomerMock(...args),
}));

import { app } from '../../src/index';
import { isBillingEnabled } from '../../src/billing/billing-mode';
import {
  NO_SUBSCRIPTION,
  isEntitled,
  listEntitlements,
  resolveSubscription,
} from '../../src/billing/entitlement.service';
import { UserSubscription } from 'dindin-shared-types';
import { sugestaoFixture } from '../support/fixtures-contrato';

const BILLING_DISABLED = {
  error: 'A assinatura está desativada: todos os recursos estão liberados',
  code: 'BILLING_DISABLED',
};

/**
 * Cobrança desligada (issue #594): o DinDin vira ferramenta gratuita. Os
 * demais testes de billing rodam com `BILLING_ENABLED=true`
 * (`tests/setup-env.js`), que é o modo pago.
 */
describe('cobrança desligada', () => {
  const original = process.env.BILLING_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BILLING_ENABLED;
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    subscriptionGetMock.mockResolvedValue({ exists: false });
    getSavedSuggestionMock.mockResolvedValue(sugestaoFixture);
  });

  afterAll(() => {
    process.env.BILLING_ENABLED = original;
  });

  it('fica desligada quando a variável está ausente ou diferente de "true"', () => {
    expect(isBillingEnabled()).toBe(false);
    process.env.BILLING_ENABLED = 'false';
    expect(isBillingEnabled()).toBe(false);
    process.env.BILLING_ENABLED = '1';
    expect(isBillingEnabled()).toBe(false);
    process.env.BILLING_ENABLED = 'true';
    expect(isBillingEnabled()).toBe(true);
  });

  it('GET /api/me devolve todos os entitlements a quem não assina', async () => {
    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.entitlements).toEqual(['ai', 'projections']);
    expect(response.body.billingEnabled).toBe(false);
    expect(response.body.subscription.status).toBe('none');
  });

  it('GET /api/me informa billingEnabled true com a cobrança ligada', async () => {
    process.env.BILLING_ENABLED = 'true';

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.entitlements).toEqual([]);
    expect(response.body.billingEnabled).toBe(true);
  });

  it('libera a rota com requireEntitlement sem assinatura', async () => {
    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/suggestions')
      .query({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(getSavedSuggestionMock).toHaveBeenCalled();
  });

  it('recusa abrir checkout da Stripe com 409 BILLING_DISABLED', async () => {
    const response = await request(app)
      .post('/api/billing/checkout-session')
      .send({ interval: 'month' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(409);
    expect(response.body).toEqual(BILLING_DISABLED);
    expect(getOrCreateCustomerMock).not.toHaveBeenCalled();
  });

  it('recusa a compra in-app com 409 BILLING_DISABLED', async () => {
    const response = await request(app)
      .post('/api/billing/store/purchase')
      .send({
        platform: 'apple',
        productId: 'dindin_basic_monthly',
        credential: 'recibo',
      })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(409);
    expect(response.body).toEqual(BILLING_DISABLED);
    expect(registerStorePurchaseMock).not.toHaveBeenCalled();
  });

  // `isEntitled` também responde "a concessão ainda vale?" para o
  // `resolveSubscription`, o webhook da Stripe e a concessão do admin. A
  // liberação gratuita decide só o acesso: misturar as duas faria uma
  // concessão manual vencida parecer vigente e esconder a Stripe paga.
  describe('vigência das concessões', () => {
    const PAST = '2026-01-01T00:00:00.000Z';
    const FUTURE = '2999-01-01T00:00:00.000Z';
    const manualVencidaComStripe: UserSubscription = {
      ...NO_SUBSCRIPTION,
      status: 'active',
      plan: 'basic',
      provider: 'manual',
      currentPeriodEnd: PAST,
      stripe: {
        status: 'active',
        interval: 'year',
        providerSubscriptionId: 'sub_1',
        currentPeriodEnd: FUTURE,
        cancelAtPeriodEnd: false,
        updatedAt: PAST,
      },
    };

    it('não considera vigente a concessão manual vencida', () => {
      expect(isEntitled(manualVencidaComStripe, 'ai')).toBe(false);
      expect(isEntitled(NO_SUBSCRIPTION, 'projections')).toBe(false);
    });

    it('volta a valer a Stripe quando a concessão manual vence', () => {
      const resolvida = resolveSubscription(manualVencidaComStripe);

      expect(resolvida.provider).toBe('stripe');
      expect(resolvida.status).toBe('active');
    });

    it('libera todos os entitlements no acesso, sem assinatura', () => {
      expect(listEntitlements(NO_SUBSCRIPTION)).toEqual(['ai', 'projections']);
    });
  });
});
