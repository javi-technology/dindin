const docGetMock = jest.fn();
const docSetMock = jest.fn();
const customerCreateMock = jest.fn();
const mockStripe = {
  customers: { create: customerCreateMock },
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: docGetMock, set: docSetMock })),
        })),
      })),
    })),
  })),
  storage: jest.fn(),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripe),
}));

import { getOrCreateCustomer } from '../../src/billing/stripe-customer.service';

describe('getOrCreateCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  });

  it('reutiliza providerCustomerId existente sem chamar a Stripe', async () => {
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ providerCustomerId: 'cus_existing' }),
    });

    const customerId = await getOrCreateCustomer('user-1', 'a@b.com');

    expect(customerId).toBe('cus_existing');
    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(docSetMock).not.toHaveBeenCalled();
  });

  it('cria customer com email e metadata.uid e grava o id no doc', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    customerCreateMock.mockResolvedValue({ id: 'cus_new' });

    const customerId = await getOrCreateCustomer('user-1', 'a@b.com');

    expect(customerCreateMock).toHaveBeenCalledWith({
      email: 'a@b.com',
      metadata: { uid: 'user-1' },
    });
    expect(docSetMock).toHaveBeenCalledWith(
      {
        provider: 'stripe',
        providerCustomerId: 'cus_new',
        updatedAt: expect.any(String),
      },
      { merge: true },
    );
    expect(customerId).toBe('cus_new');
  });

  it('cria customer sem email quando indefinido', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    customerCreateMock.mockResolvedValue({ id: 'cus_new' });

    await getOrCreateCustomer('user-1', undefined);

    expect(customerCreateMock).toHaveBeenCalledWith({
      email: undefined,
      metadata: { uid: 'user-1' },
    });
  });
});
