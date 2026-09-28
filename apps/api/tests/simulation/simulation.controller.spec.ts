import request from 'supertest';

const verifyIdTokenMock = jest.fn();
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
  simulateRecommendedWallet: (...args: unknown[]) =>
    simulateRecommendedWalletMock(...args),
  listSimulationProviders: (...args: unknown[]) =>
    listSimulationProvidersMock(...args),
}));

jest.mock('../../src/billing/entitlement.service', () => ({
  hasEntitlement: (...args: unknown[]) => hasEntitlementMock(...args),
}));

import { app } from '../../src/index';

const result = { totalIncome: 10, byTicker: [], unallocatedAmount: 0 };

describe('simulation.controller — carteira sugerida', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    simulateRecommendedWalletMock.mockResolvedValue(result);
    listSimulationProvidersMock.mockResolvedValue([
      { slug: 'bb-fii', label: 'Banco do Brasil — FIIs', months: ['2026-09'] },
    ]);
    // A simulação geral é gratuita: nenhuma rota dela consulta assinatura.
    hasEntitlementMock.mockResolvedValue(false);
  });

  it('deve simular a carteira sugerida para usuário autenticado', async () => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 1000, months: 12, mode: 'reinvest' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(simulateRecommendedWalletMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, months: 12, mode: 'reinvest' }),
    );
  });

  it('deve responder sem recorte para quem não assina', async () => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 1000, months: 1 });

    expect(response.status).toBe(200);
    expect(response.body.limited).toBeUndefined();
    expect(hasEntitlementMock).not.toHaveBeenCalled();
  });

  it('deve aceitar valor com vírgula decimal e separador de milhar', async () => {
    await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: '1.500,55', months: 1 });

    expect(simulateRecommendedWalletMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500.55 }),
    );
  });

  it('deve usar saque como modo padrão', async () => {
    await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 100, months: 1 });

    expect(simulateRecommendedWalletMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'withdraw' }),
    );
  });

  it('deve repassar provedor, mês e aba escolhidos', async () => {
    await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({
        amount: 100,
        months: 1,
        provider: 'bb-fii',
        month: '2026-08',
        tab: 'ganho',
      });

    expect(simulateRecommendedWalletMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'bb-fii',
        month: '2026-08',
        tab: 'ganho',
      }),
    );
  });

  it.each([
    ['ausente', {}],
    ['zero', { amount: 0 }],
    ['negativo', { amount: -10 }],
    ['acima do limite', { amount: 100000001 }],
    ['não numérico', { amount: 'muito' }],
  ])('deve recusar valor %s com 400 em português', async (_label, body) => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ months: 1, ...body });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/[çãéó]/);
    expect(simulateRecommendedWalletMock).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0],
    ['negativo', -1],
    ['fracionado', 1.5],
    ['acima do limite', 361],
  ])('deve recusar horizonte %s com 400', async (_label, months) => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 100, months });

    expect(response.status).toBe(400);
    expect(simulateRecommendedWalletMock).not.toHaveBeenCalled();
  });

  it('deve recusar modo de reinvestimento inválido', async () => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 100, months: 1, mode: 'talvez' });

    expect(response.status).toBe(400);
  });

  it('deve repassar o 404 de carteira sugerida inexistente', async () => {
    simulateRecommendedWalletMock.mockRejectedValue(
      Object.assign(new Error('Carteira sugerida não encontrada'), {
        statusCode: 404,
        expose: true,
      }),
    );

    const response = await request(app)
      .post('/api/simulations/wallet')
      .set('Authorization', 'Bearer token')
      .send({ amount: 100, months: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Carteira sugerida não encontrada');
  });

  it('deve listar as carteiras sugeridas disponíveis para simulação', async () => {
    const response = await request(app)
      .get('/api/simulations/wallets')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ slug: 'bb-fii', months: ['2026-09'] }),
    ]);
  });

  it('deve exigir autenticação', async () => {
    const response = await request(app)
      .post('/api/simulations/wallet')
      .send({ amount: 100, months: 1 });

    expect(response.status).toBe(401);
  });
});
