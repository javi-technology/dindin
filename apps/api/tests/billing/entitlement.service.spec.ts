import { StripeSubscriptionState, UserSubscription } from 'dindin-shared-types';

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
  effectiveStatus,
  getSubscription,
  hasEntitlement,
  isEntitled,
  listEntitlements,
  NO_SUBSCRIPTION,
  resolveSubscription,
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

  describe('concessão manual', () => {
    const manual = (currentPeriodEnd: string | null) =>
      sub({
        status: 'active',
        provider: 'manual',
        interval: null,
        currentPeriodEnd,
      });

    it('deve liberar ai sem validade', () => {
      expect(isEntitled(manual(null), 'ai', false, NOW)).toBe(true);
    });

    it('deve liberar ai dentro da validade', () => {
      expect(isEntitled(manual(FUTURE), 'ai', false, NOW)).toBe(true);
    });

    it('deve negar ai após a validade', () => {
      expect(isEntitled(manual(PAST), 'ai', false, NOW)).toBe(false);
    });
  });
});

describe('entitlement.service – effectiveStatus', () => {
  it('deve tratar concessão manual expirada como canceled', () => {
    expect(
      effectiveStatus(
        sub({ status: 'active', provider: 'manual', currentPeriodEnd: PAST }),
        NOW,
      ),
    ).toBe('canceled');
  });

  it.each([
    [
      'manual sem validade',
      { provider: 'manual' as const, currentPeriodEnd: null },
    ],
    [
      'manual vigente',
      { provider: 'manual' as const, currentPeriodEnd: FUTURE },
    ],
    [
      'stripe com período vencido',
      { provider: 'stripe' as const, currentPeriodEnd: PAST },
    ],
  ])('deve manter o status para %s', (_label, partial) => {
    expect(effectiveStatus(sub({ status: 'active', ...partial }), NOW)).toBe(
      'active',
    );
  });
});

describe('entitlement.service – resolveSubscription', () => {
  const stripe = (partial: Partial<StripeSubscriptionState> = {}) => ({
    status: 'active' as const,
    interval: 'year' as const,
    providerSubscriptionId: 'sub_1',
    currentPeriodEnd: FUTURE,
    cancelAtPeriodEnd: false,
    updatedAt: '2026-09-05T00:00:00.000Z',
    ...partial,
  });
  const manual = (partial: Partial<UserSubscription>) =>
    sub({
      status: 'active',
      interval: null,
      provider: 'manual',
      providerCustomerId: 'cus_1',
      currentPeriodEnd: PAST,
      ...partial,
    });

  it.each([
    ['expirada', { currentPeriodEnd: PAST }],
    ['revogada', { status: 'canceled' as const, currentPeriodEnd: FUTURE }],
  ])(
    'deve usar o estado da Stripe guardado quando a concessão manual está %s',
    (_label, partial) => {
      const resolved = resolveSubscription(
        manual({ ...partial, stripe: stripe() }),
        NOW,
      );

      expect(resolved).toEqual(
        expect.objectContaining({
          status: 'active',
          plan: 'basic',
          interval: 'year',
          provider: 'stripe',
          providerCustomerId: 'cus_1',
          providerSubscriptionId: 'sub_1',
          currentPeriodEnd: FUTURE,
          cancelAtPeriodEnd: false,
        }),
      );
      expect(isEntitled(resolved, 'ai', false, NOW)).toBe(true);
      expect(effectiveStatus(resolved, NOW)).toBe('active');
    },
  );

  it('deve manter a concessão manual vigente mesmo com Stripe ativa', () => {
    const doc = manual({ currentPeriodEnd: FUTURE, stripe: stripe() });

    expect(resolveSubscription(doc, NOW)).toEqual(doc);
  });

  it('deve usar past_due guardado para bloquear novo checkout', () => {
    const resolved = resolveSubscription(
      manual({
        stripe: stripe({ status: 'past_due', currentPeriodEnd: PAST }),
      }),
      NOW,
    );

    expect(effectiveStatus(resolved, NOW)).toBe('past_due');
    expect(isEntitled(resolved, 'ai', false, NOW)).toBe(false);
  });

  it('deve manter a concessão expirada quando a Stripe guardada foi cancelada', () => {
    const doc = manual({ stripe: stripe({ status: 'canceled' }) });

    expect(resolveSubscription(doc, NOW)).toEqual(doc);
    expect(effectiveStatus(doc, NOW)).toBe('canceled');
    expect(isEntitled(doc, 'ai', false, NOW)).toBe(false);
  });

  it('deve manter docs sem estado da Stripe guardado', () => {
    const doc = manual({});

    expect(resolveSubscription(doc, NOW)).toEqual(doc);
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

  it('deve resolver a Stripe guardada sob concessão manual expirada', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () =>
        sub({
          status: 'active',
          provider: 'manual',
          currentPeriodEnd: '2000-01-01T00:00:00.000Z',
          stripe: {
            status: 'active',
            interval: 'month',
            providerSubscriptionId: 'sub_1',
            currentPeriodEnd: '2999-01-01T00:00:00.000Z',
            cancelAtPeriodEnd: false,
            updatedAt: '2026-09-05T00:00:00.000Z',
          },
        }),
    });

    await expect(getSubscription('user-1')).resolves.toEqual(
      expect.objectContaining({ provider: 'stripe', status: 'active' }),
    );
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
