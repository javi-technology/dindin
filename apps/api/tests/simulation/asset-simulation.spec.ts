import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const simulateAssetMock = jest.fn();
const simulateRecommendedWalletMock = jest.fn();
const listSimulationProvidersMock = jest.fn();
const hasEntitlementMock = jest.fn();

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));
jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({ collection: jest.fn() })),
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));

jest.mock('../../src/simulation/simulation.service', () => ({
  simulateAsset: (...args: unknown[]) => simulateAssetMock(...args),
  simulateRecommendedWallet: (...args: unknown[]) =>
    simulateRecommendedWalletMock(...args),
  listSimulationProviders: (...args: unknown[]) =>
    listSimulationProvidersMock(...args),
}));

jest.mock('../../src/billing/entitlement.service', () => ({
  hasEntitlement: (...args: unknown[]) => hasEntitlementMock(...args),
}));

import { app } from '../../src/index';

const result = { ticker: 'MXRF11', totalIncome: 10, byTicker: [] };

function post(body: unknown) {
  return request(app)
    .post('/api/simulations/asset')
    .set('Authorization', 'Bearer token')
    .send(body);
}

describe('simulação por ativo sob assinatura', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    simulateAssetMock.mockResolvedValue(result);
    simulateRecommendedWalletMock.mockResolvedValue({ totalIncome: 1 });
    hasEntitlementMock.mockResolvedValue(true);
  });

  it('deve devolver o resultado completo ao assinante', async () => {
    const response = await post({ ticker: 'mxrf11', amount: 1000, months: 12 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(hasEntitlementMock).toHaveBeenCalledWith(
      'user-1',
      'projections',
      false,
    );
    expect(simulateAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'MXRF11', amount: 1000, months: 12 }),
    );
  });

  it('deve bloquear quem não assina sem devolver nenhum dado do cálculo', async () => {
    hasEntitlementMock.mockResolvedValue(false);

    const response = await post({ ticker: 'MXRF11', amount: 1000, months: 1 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Acesso negado',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    expect(simulateAssetMock).not.toHaveBeenCalled();
  });

  it('deve liberar o admin', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });

    const response = await post({ ticker: 'MXRF11', amount: 100, months: 1 });

    expect(response.status).toBe(200);
    expect(hasEntitlementMock).toHaveBeenCalledWith(
      'admin-1',
      'projections',
      true,
    );
  });

  it('deve responder 404 em português para ticker fora do catálogo', async () => {
    simulateAssetMock.mockRejectedValue(
      Object.assign(new Error('Ativo não encontrado no catálogo'), {
        statusCode: 404,
        expose: true,
      }),
    );

    const response = await post({ ticker: 'XXXX99', amount: 100, months: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Ativo não encontrado no catálogo');
  });

  it.each([
    ['ausente', {}],
    ['zero', { amount: 0 }],
    ['negativo', { amount: -1 }],
    ['acima do limite', { amount: 100000001 }],
    ['não numérico', { amount: 'muito' }],
  ])('deve recusar valor %s com 400', async (_label, body) => {
    const response = await post({ ticker: 'MXRF11', months: 1, ...body });

    expect(response.status).toBe(400);
    expect(simulateAssetMock).not.toHaveBeenCalled();
  });

  it('deve aceitar valor com vírgula decimal', async () => {
    await post({ ticker: 'MXRF11', amount: '1.500,55', months: 1 });

    expect(simulateAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500.55 }),
    );
  });

  it('deve recusar ticker ausente com 400', async () => {
    const response = await post({ amount: 100, months: 1 });

    expect(response.status).toBe(400);
    expect(simulateAssetMock).not.toHaveBeenCalled();
  });

  it('deve manter a simulação por carteira acessível sem assinatura', async () => {
    hasEntitlementMock.mockResolvedValue(false);

    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 100, months: 1 });

    expect(response.status).toBe(200);
    expect(simulateRecommendedWalletMock).toHaveBeenCalled();
  });

  it('deve exigir autenticação antes do gate de assinatura', async () => {
    const response = await request(app)
      .post('/api/simulations/asset')
      .send({ ticker: 'MXRF11', amount: 100, months: 1 });

    expect(response.status).toBe(401);
    expect(hasEntitlementMock).not.toHaveBeenCalled();
  });
});
