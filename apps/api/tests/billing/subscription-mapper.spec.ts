import type Stripe from 'stripe';
import {
  mapStripeStatus,
  mapSubscription,
  resolveUid,
} from '../../src/billing/subscription-mapper';

function makeSubscription(
  partial: Record<string, unknown> = {},
): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    metadata: {},
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          current_period_end: 1893456000, // 2030-01-01T00:00:00.000Z
          price: {
            id: 'price_1',
            object: 'price',
            recurring: { interval: 'month' },
          },
        },
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
    ...partial,
  } as unknown as Stripe.Subscription;
}

describe('mapStripeStatus', () => {
  it.each([
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['canceled', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['incomplete', 'none'],
    ['paused', 'none'],
  ] as const)('mapeia %s → %s', (stripe, expected) => {
    expect(mapStripeStatus(stripe as Stripe.Subscription.Status)).toBe(
      expected,
    );
  });
});

describe('mapSubscription', () => {
  it('mapeia assinatura mensal ativa', () => {
    const result = mapSubscription(makeSubscription(), 'cus_1');

    expect(result).toEqual({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      provider: 'stripe',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      updatedAt: expect.any(String),
    });
  });

  it('mapeia intervalo anual', () => {
    const sub = makeSubscription();
    sub.items.data[0].price.recurring!.interval = 'year';

    expect(mapSubscription(sub, 'cus_1').interval).toBe('year');
  });

  it('devolve interval null para intervalos não suportados', () => {
    const sub = makeSubscription();
    sub.items.data[0].price.recurring!.interval = 'day';

    expect(mapSubscription(sub, 'cus_1').interval).toBeNull();
  });

  it('devolve currentPeriodEnd null sem item', () => {
    const sub = makeSubscription();
    sub.items.data = [];

    expect(mapSubscription(sub, 'cus_1').currentPeriodEnd).toBeNull();
  });

  it('propaga cancel_at_period_end', () => {
    expect(
      mapSubscription(makeSubscription({ cancel_at_period_end: true }), 'cus_1')
        .cancelAtPeriodEnd,
    ).toBe(true);
  });
});

describe('resolveUid', () => {
  it('prefere metadata.uid da assinatura', () => {
    const sub = makeSubscription({ metadata: { uid: 'user-1' } });
    const customer = {
      metadata: { uid: 'user-2' },
    } as unknown as Stripe.Customer;

    expect(resolveUid(sub, customer)).toBe('user-1');
  });

  it('cai para metadata.uid do customer', () => {
    const customer = {
      metadata: { uid: 'user-2' },
    } as unknown as Stripe.Customer;

    expect(resolveUid(makeSubscription(), customer)).toBe('user-2');
  });

  it('devolve null sem uid em nenhum lugar', () => {
    expect(resolveUid(makeSubscription())).toBeNull();
    expect(resolveUid(makeSubscription(), null)).toBeNull();
  });
});
