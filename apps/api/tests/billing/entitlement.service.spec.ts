import { UserSubscription } from 'dindin-shared-types';

const getMock = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: getMock })),
        })),
      })),
    })),
  })),
}));

import {
  getSubscription,
  hasEntitlement,
  isEntitled,
  listEntitlements,
  NO_SUBSCRIPTION,
  toPublicSubscription,
} from '../../src/billing/entitlement.service';

const NOW = new Date('2026-09-08T12:00:00Z');
const FUTURE = '2026-09-20T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

function sub(partial: Partial<UserSubscription>): UserSubscription {
  return {
    ...NO_SUBSCRIPTION,
    plan: 'basic',
    interval: 'month',
    provider: 'stripe',
    ...partial,
  };
}

describe('entitlement.service – isEntitled', () => {
  it.each(['active', 'trialing'] as const)(
    'deve liberar ai com status %s',
    (status) => {
      expect(isEntitled(sub({ status }), 'ai', false, NOW)).toBe(true);
    },
  );

  it.each(['none', 'canceled'] as const)(
    'deve negar ai com status %s',
    (status) => {
      expect(isEntitled(sub({ status }), 'ai', false, NOW)).toBe(false);
    },
  );

  it('deve liberar ai em past_due dentro da carência', () => {
    expect(
      isEntitled(
        sub({ status: 'past_due', currentPeriodEnd: FUTURE }),
        'ai',
        false,
        NOW,
      ),
    ).toBe(true);
  });

  it('deve negar ai em past_due fora da carência', () => {
    expect(
      isEntitled(
        sub({ status: 'past_due', currentPeriodEnd: PAST }),
        'ai',
        false,
        NOW,
      ),
    ).toBe(false);
  });

  it('deve negar ai em past_due sem currentPeriodEnd', () => {
    expect(
      isEntitled(
        sub({ status: 'past_due', currentPeriodEnd: null }),
        'ai',
        false,
        NOW,
      ),
    ).toBe(false);
  });

  it('deve liberar ai para admin sem assinatura', () => {
    expect(isEntitled(NO_SUBSCRIPTION, 'ai', true, NOW)).toBe(true);
  });
});

describe('entitlement.service – getSubscription / hasEntitlement', () => {
  beforeEach(() => getMock.mockReset());

  it('deve devolver status none quando o documento não existe', async () => {
    getMock.mockResolvedValue({ exists: false });

    await expect(getSubscription('user-1')).resolves.toEqual(NO_SUBSCRIPTION);
    await expect(hasEntitlement('user-1', 'ai')).resolves.toBe(false);
  });

  it('deve ler o documento de assinatura e liberar quando active', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => sub({ status: 'active', providerCustomerId: 'cus_1' }),
    });

    const subscription = await getSubscription('user-1');
    expect(subscription.status).toBe('active');
    expect(subscription.providerCustomerId).toBe('cus_1');
    await expect(hasEntitlement('user-1', 'ai')).resolves.toBe(true);
  });

  it('deve liberar admin sem consultar o Firestore', async () => {
    await expect(hasEntitlement('admin-1', 'ai', true)).resolves.toBe(true);
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe('entitlement.service – helpers', () => {
  it('toPublicSubscription deve omitir ids do provedor', () => {
    const result = toPublicSubscription(
      sub({
        status: 'active',
        providerCustomerId: 'cus_1',
        providerSubscriptionId: 'sub_1',
        currentPeriodEnd: FUTURE,
      }),
    );

    expect(result).toEqual({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: FUTURE,
      cancelAtPeriodEnd: false,
    });
    expect(result).not.toHaveProperty('providerCustomerId');
    expect(result).not.toHaveProperty('provider');
  });

  it('listEntitlements deve devolver ai apenas quando liberado', () => {
    expect(listEntitlements(NO_SUBSCRIPTION)).toEqual([]);
    expect(listEntitlements(NO_SUBSCRIPTION, true)).toEqual(['ai']);
    expect(listEntitlements(sub({ status: 'active' }))).toEqual(['ai']);
  });
});
