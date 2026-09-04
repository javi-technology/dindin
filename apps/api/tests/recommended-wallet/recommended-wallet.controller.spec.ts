import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const listRecommendedWalletsMock = jest.fn();
const getRecommendedWalletMock = jest.fn();
const compareWithWalletMock = jest.fn();
const importBbWalletMock = jest.fn();
const confirmRecommendedWalletMock = jest.fn();
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
  importBbWallet: (...args: unknown[]) => importBbWalletMock(...args),
  confirmRecommendedWallet: (...args: unknown[]) =>
    confirmRecommendedWalletMock(...args),
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
  });

  it('deve importar PDF somente para usuário admin', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
    parseBbFileNameMock.mockReturnValue({ month: '2026-09', revision: 2 });
    importBbWalletMock.mockResolvedValue({ id: 'bb-fii_2026-09' });

    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', 'Bearer token')
      .send({
        fileName: 'CartFII_Set26_2.pdf',
        contentBase64: Buffer.from('pdf').toString('base64'),
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'bb-fii_2026-09' });
    expect(importBbWalletMock).toHaveBeenCalledWith(
      Buffer.from('pdf'),
      'wallets/fii-bb/CartFII_Set26_2.pdf',
    );
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
    expect(importBbWalletMock).not.toHaveBeenCalled();
  });
});
