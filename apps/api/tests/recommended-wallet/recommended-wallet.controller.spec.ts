import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const listRecommendedWalletsMock = jest.fn();
const getRecommendedWalletMock = jest.fn();
const compareWithWalletMock = jest.fn();
const buildRecommendedWalletMock = jest.fn();
const persistRecommendedWalletMock = jest.fn();
const importBbWalletMock = jest.fn();
const syncBbWalletMock = jest.fn();
const confirmRecommendedWalletMock = jest.fn();
const getSavedSuggestionMock = jest.fn();
const generateSuggestionMock = jest.fn();
const parseBbFileNameMock = jest.fn();
const saveBbPdfMock = jest.fn();

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
  firestore: jest.fn(() => ({ collection: jest.fn() })),
  storage: jest.fn(),
}));

jest.mock('../../src/recommended-wallet/recommended-wallet.service', () => ({
  listRecommendedWallets: (...args: unknown[]) =>
    listRecommendedWalletsMock(...args),
  getRecommendedWallet: (...args: unknown[]) =>
    getRecommendedWalletMock(...args),
  compareWithWallet: (...args: unknown[]) => compareWithWalletMock(...args),
  buildRecommendedWallet: (...args: unknown[]) =>
    buildRecommendedWalletMock(...args),
  persistRecommendedWallet: (...args: unknown[]) =>
    persistRecommendedWalletMock(...args),
  importBbWallet: (...args: unknown[]) => importBbWalletMock(...args),
  syncBbWallet: (...args: unknown[]) => syncBbWalletMock(...args),
  confirmRecommendedWallet: (...args: unknown[]) =>
    confirmRecommendedWalletMock(...args),
}));

jest.mock('../../src/recommended-wallet/ai-suggestion.service', () => ({
  getSavedSuggestion: (...args: unknown[]) => getSavedSuggestionMock(...args),
  generateSuggestion: (...args: unknown[]) => generateSuggestionMock(...args),
}));

jest.mock('../../src/billing/entitlement.service', () => ({
  hasEntitlement: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/recommended-wallet/bb-pdf.parser', () => ({
  parseBbFileName: (...args: unknown[]) => parseBbFileNameMock(...args),
}));

jest.mock('../../src/recommended-wallet/storage.service', () => ({
  saveBbPdf: (...args: unknown[]) => saveBbPdfMock(...args),
}));

import { app } from '../../src/index';

describe('recommended-wallet.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    saveBbPdfMock.mockResolvedValue('wallets/fii-bb/CartFII_Set26_2.pdf');
    parseBbFileNameMock.mockReturnValue({ month: '2026-09', revision: 2 });
    buildRecommendedWalletMock.mockResolvedValue({
      id: 'bb-fii_2026-09',
      month: '2026-09',
      revision: 2,
    });
    persistRecommendedWalletMock.mockResolvedValue({
      id: 'bb-fii_2026-09',
    });
    getSavedSuggestionMock.mockResolvedValue(undefined);
  });

  it('deve listar carteiras recomendadas para usuário autenticado', async () => {
    listRecommendedWalletsMock.mockResolvedValue([{ id: 'bb-fii_2026-09' }]);

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'bb-fii_2026-09' }]);
  });

  it('deve retornar 404 quando a carteira mais recente não existe', async () => {
    getRecommendedWalletMock.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/latest')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'Carteira recomendada não encontrada',
    });
  });

  it('deve retornar a mensagem real ao confirmar carteira inexistente', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    const error = Object.assign(
      new Error('Carteira recomendada não encontrada'),
      { statusCode: 404 },
    );
    confirmRecommendedWalletMock.mockRejectedValue(error);

    const response = await request(app)
      .put('/api/admin/recommended-wallets/bb-fii/bb-fii_2026-09/confirm')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'Carteira recomendada não encontrada',
    });
  });

  it('deve manter mensagem genérica para erros internos', async () => {
    getRecommendedWalletMock.mockRejectedValue(new Error('falha interna'));

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/latest')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  it('deve importar PDF somente para usuário admin', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    parseBbFileNameMock.mockReturnValue({ month: '2026-09', revision: 2 });
    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', 'Bearer token')
      .send({
        fileName: 'CartFII_Set26_2.pdf',
        contentBase64: Buffer.from('pdf').toString('base64'),
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'bb-fii_2026-09' });
    expect(buildRecommendedWalletMock).toHaveBeenCalledWith(
      Buffer.from('pdf'),
      'wallets/fii-bb/CartFII_Set26_2.pdf',
    );
    expect(persistRecommendedWalletMock).toHaveBeenCalled();
  });

  it('deve rejeitar nome inválido no endpoint de importação', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    parseBbFileNameMock.mockReturnValue(null);

    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', 'Bearer token')
      .send({
        fileName: 'invalido.pdf',
        contentBase64: Buffer.from('pdf').toString('base64'),
      });

    expect(response.status).toBe(400);
    expect(buildRecommendedWalletMock).not.toHaveBeenCalled();
  });

  it('deve validar o PDF antes de salvar no Storage', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    const error = new Error(
      'A tabela de fundos recomendados deve conter entre 4 e 15 linhas',
    );
    buildRecommendedWalletMock.mockRejectedValue(error);

    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', 'Bearer token')
      .send({
        fileName: 'CartFII_Set26_2.pdf',
        contentBase64: Buffer.from('pdf').toString('base64'),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: error.message });
    expect(saveBbPdfMock).not.toHaveBeenCalled();
    expect(persistRecommendedWalletMock).not.toHaveBeenCalled();
  });

  it('deve retornar 404 quando não houver sugestão salva', async () => {
    getSavedSuggestionMock.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/suggestions')
      .query({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
  });

  it('deve retornar uma sugestão salva', async () => {
    getSavedSuggestionMock.mockResolvedValue({ id: 'suggestion-1' });

    const response = await request(app)
      .get('/api/recommended-wallets/bb-fii/suggestions')
      .query({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'suggestion-1' });
  });

  it('deve rejeitar geração sem dados obrigatórios', async () => {
    const response = await request(app)
      .post('/api/recommended-wallets/bb-fii/suggestions')
      .send({ walletId: 'wallet-1' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(400);
    expect(generateSuggestionMock).not.toHaveBeenCalled();
  });

  it.each([-1, 'abc'])(
    'deve rejeitar aporte inválido %p',
    async (contribution) => {
      const response = await request(app)
        .post('/api/recommended-wallets/bb-fii/suggestions')
        .send({
          walletId: 'wallet-1',
          month: '2026-09',
          tab: 'renda',
          contribution,
        })
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(400);
      expect(generateSuggestionMock).not.toHaveBeenCalled();
    },
  );

  it('deve gerar sugestão com status 201', async () => {
    generateSuggestionMock.mockResolvedValue({ id: 'suggestion-1' });

    const response = await request(app)
      .post('/api/recommended-wallets/bb-fii/suggestions')
      .send({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'suggestion-1' });
    expect(generateSuggestionMock).toHaveBeenCalledWith(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      false,
      undefined,
    );
  });

  it('deve delegar a validação do cache ao serviço', async () => {
    generateSuggestionMock.mockResolvedValue({
      id: 'suggestion-1',
      contribution: 500,
    });

    const response = await request(app)
      .post('/api/recommended-wallets/bb-fii/suggestions')
      .send({
        walletId: 'wallet-1',
        month: '2026-09',
        tab: 'renda',
        contribution: 500,
      })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    expect(getSavedSuggestionMock).not.toHaveBeenCalled();
    expect(generateSuggestionMock).toHaveBeenCalledWith(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      false,
      500,
    );
  });

  it('deve gerar novamente quando o aporte for diferente do cache', async () => {
    generateSuggestionMock.mockResolvedValue({
      id: 'suggestion-2',
      contribution: 600,
    });

    const response = await request(app)
      .post('/api/recommended-wallets/bb-fii/suggestions')
      .send({
        walletId: 'wallet-1',
        month: '2026-09',
        tab: 'renda',
        contribution: 600,
      })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    expect(getSavedSuggestionMock).not.toHaveBeenCalled();
    expect(generateSuggestionMock).toHaveBeenCalledWith(
      'user-1',
      'wallet-1',
      '2026-09',
      'renda',
      false,
      600,
    );
  });

  it('deve propagar limite e falha do provedor', async () => {
    for (const error of [
      Object.assign(new Error('Limite diário de sugestões atingido'), {
        statusCode: 429,
      }),
      Object.assign(new Error('Falha ao consultar o provedor de IA'), {
        statusCode: 502,
      }),
    ]) {
      generateSuggestionMock.mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/recommended-wallets/bb-fii/suggestions')
        .query({ force: 'true' })
        .send({ walletId: 'wallet-1', month: '2026-09', tab: 'renda' })
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(error.statusCode);
      expect(response.body).toEqual({ error: error.message });
    }
  });
});
