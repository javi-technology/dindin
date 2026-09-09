import { getStripe } from './stripe.client';
import { getSubscription, subscriptionDoc } from './entitlement.service';

export async function getOrCreateCustomer(
  uid: string,
  email: string | undefined,
): Promise<string> {
  const subscription = await getSubscription(uid);
  if (subscription.providerCustomerId) {
    return subscription.providerCustomerId;
  }

  const customer = await getStripe().customers.create({
    email,
    metadata: { uid },
  });

  await subscriptionDoc(uid).set(
    {
      provider: 'stripe',
      providerCustomerId: customer.id,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return customer.id;
}
