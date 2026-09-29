import type { UserSubscription } from 'dindin-shared-types';

// ---------------------------------------------------------------------------
// Compra in-app e conciliação da assinatura nas lojas (issue #405)
//
// A regra central: o entitlement só é concedido depois que o backend valida o
// recibo com a loja. O que o app afirma nunca basta.
// ---------------------------------------------------------------------------

const validateMock = jest.fn();
const getValidatorMock = jest.fn();
const txGetMock = jest.fn();
const txSetMock = jest.fn();
const runTransactionMock = jest.fn(async (cb: (tx: unknown) => unknown) =>
  cb({ get: txGetMock, set: txSetMock }),
);
const logInfoMock = jest.fn();
const logWarnMock = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({ runTransaction: runTransactionMock })),
}));

jest.mock('../../src/firestore/paths', () => ({
  subscriptionDocument: (uid: string) => ({ path: `sub/${uid}` }),
  storeSubscriptionDocument: (platform: string, id: string) => ({
    path: `store/${platform}_${id}`,
  }),
}));

jest.mock('../../src/billing/store/store-validators', () => ({
  ...jest.requireActual('../../src/billing/store/store-validators'),
  getStoreValidator: (...args: unknown[]) => getValidatorMock(...args),
}));

jest.mock('../../src/shared/logger', () => ({
  logInfo: (...a: unknown[]) => logInfoMock(...a),
  logWarn: (...a: unknown[]) => logWarnMock(...a),
  logError: jest.fn(),
}));

import {
  applyStoreNotification,
  registerStorePurchase,
  StoreBillingError,
} from '../../src/billing/store/store-purchase.service';
import { InvalidReceiptError } from '../../src/billing/store/store-validators';

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();

function snap(data?: unknown) {
  return { exists: data !== undefined, data: () => data };
}

function stubStorage(
  sub?: Partial<UserSubscription>,
  mapping?: { uid: string },
) {
  txGetMock.mockImplementation(async (ref: { path: string }) =>
    ref.path.startsWith('sub/') ? snap(sub) : snap(mapping),
  );
}

const valid = {
  status: 'active',
  productId: 'dindin_basic_monthly',
  originalId: 'orig-1',
  currentPeriodEnd: FUTURE,
  cancelAtPeriodEnd: false,
  eventTime: 1000,
};

const input = {
  uid: 'alice',
  platform: 'apple' as const,
  productId: 'dindin_basic_monthly',
  credential: 'recibo',
};

beforeEach(() => {
  jest.clearAllMocks();
  validateMock.mockResolvedValue(valid);
  getValidatorMock.mockReturnValue({ validate: validateMock });
  stubStorage(undefined, undefined);
});

describe('registerStorePurchase', () => {
  it('concede a assinatura depois de validar o recibo com a loja', async () => {
    const result = await registerStorePurchase(input);

    expect(validateMock).toHaveBeenCalledWith({
      productId: 'dindin_basic_monthly',
      credential: 'recibo',
    });
    const [, gravado] = txSetMock.mock.calls.find(
      ([ref]) => ref.path === 'sub/alice',
    )!;
    expect(gravado).toMatchObject({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      provider: 'apple',
      providerSubscriptionId: 'orig-1',
      currentPeriodEnd: FUTURE,
    });
    expect(result).toMatchObject({ status: 'active', interval: 'month' });
  });

  it('mapeia o produto anual para o intervalo year', async () => {
    validateMock.mockResolvedValue({
      ...valid,
      productId: 'dindin_basic_yearly',
    });
    const result = await registerStorePurchase({
      ...input,
      productId: 'dindin_basic_yearly',
    });
    expect(result.interval).toBe('year');
  });

  it('recusa recibo inválido sem gravar nada', async () => {
    validateMock.mockRejectedValue(new InvalidReceiptError('recibo falso'));

    await expect(registerStorePurchase(input)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_RECEIPT',
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('recusa produto desconhecido sem consultar a loja', async () => {
    await expect(
      registerStorePurchase({ ...input, productId: 'outro' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'UNKNOWN_PRODUCT' });
    expect(validateMock).not.toHaveBeenCalled();
  });

  it('recusa quando o recibo validado é de outro produto', async () => {
    validateMock.mockResolvedValue({
      ...valid,
      productId: 'dindin_basic_yearly',
    });
    await expect(registerStorePurchase(input)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_RECEIPT',
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('não concede quando a loja diz que o recibo está expirado', async () => {
    validateMock.mockResolvedValue({ ...valid, status: 'canceled' });
    const result = await registerStorePurchase(input);
    expect(result.status).toBe('canceled');
  });

  it('recusa quando já há assinatura Stripe vigente', async () => {
    stubStorage({
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: FUTURE,
    });
    await expect(registerStorePurchase(input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_SUBSCRIBED',
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('recusa recibo que já pertence a outro usuário', async () => {
    stubStorage(undefined, { uid: 'bob' });
    await expect(registerStorePurchase(input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'RECEIPT_ALREADY_USED',
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('aceita restaurar a própria compra em outro aparelho', async () => {
    stubStorage(
      { status: 'active', provider: 'apple', currentPeriodEnd: FUTURE },
      { uid: 'alice' },
    );
    const result = await registerStorePurchase(input);
    expect(result.status).toBe('active');
  });

  it('propaga a loja não configurada como 503', async () => {
    getValidatorMock.mockImplementation(() => {
      throw new StoreBillingError(
        'Compra na loja indisponível',
        503,
        'STORE_NOT_CONFIGURED',
      );
    });
    await expect(registerStorePurchase(input)).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORE_NOT_CONFIGURED',
    });
  });

  it('registra a transição em log estruturado, sem o recibo', async () => {
    await registerStorePurchase(input);
    const chamadas = JSON.stringify(logInfoMock.mock.calls);
    expect(logInfoMock).toHaveBeenCalledWith(
      'billing.store.purchase',
      expect.objectContaining({ uid: 'alice', platform: 'apple' }),
    );
    expect(chamadas).not.toContain('recibo');
  });
});

describe('applyStoreNotification', () => {
  const base = { platform: 'google' as const, originalId: 'orig-1' };

  it.each([
    ['canceled', 'canceled'],
    ['past_due', 'past_due'],
    ['active', 'active'],
  ] as const)('reflete %s no entitlement', async (status, esperado) => {
    stubStorage({ status: 'active', provider: 'google' }, { uid: 'alice' });
    await applyStoreNotification({
      ...base,
      info: { ...valid, status, eventTime: 2000 },
    });
    const [, gravado] = txSetMock.mock.calls.find(
      ([ref]) => ref.path === 'sub/alice',
    )!;
    expect(gravado.status).toBe(esperado);
  });

  it('marca cancelAtPeriodEnd quando o usuário cancelou a renovação', async () => {
    stubStorage({ status: 'active', provider: 'google' }, { uid: 'alice' });
    await applyStoreNotification({
      ...base,
      info: { ...valid, cancelAtPeriodEnd: true, eventTime: 2000 },
    });
    const [, gravado] = txSetMock.mock.calls.find(
      ([ref]) => ref.path === 'sub/alice',
    )!;
    expect(gravado.cancelAtPeriodEnd).toBe(true);
  });

  it('ignora notificação de compra desconhecida, sem lançar', async () => {
    stubStorage(undefined, undefined);
    await expect(
      applyStoreNotification({ ...base, info: valid }),
    ).resolves.toBeUndefined();
    expect(txSetMock).not.toHaveBeenCalled();
    expect(logWarnMock).toHaveBeenCalledWith(
      'billing.store.unknownPurchase',
      expect.any(Object),
    );
  });

  it('ignora notificação mais antiga que o estado gravado', async () => {
    stubStorage(
      {
        status: 'active',
        provider: 'google',
        providerEventCreated: 5000,
      },
      { uid: 'alice' },
    );
    await applyStoreNotification({
      ...base,
      info: { ...valid, status: 'canceled', eventTime: 1000 },
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('não sobrescreve assinatura de outro provedor vigente', async () => {
    stubStorage(
      { status: 'active', provider: 'stripe', currentPeriodEnd: FUTURE },
      { uid: 'alice' },
    );
    await applyStoreNotification({
      ...base,
      info: { ...valid, status: 'canceled', eventTime: 2000 },
    });
    expect(txSetMock).not.toHaveBeenCalled();
  });
});
