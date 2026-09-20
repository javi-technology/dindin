import request from 'supertest';

const verifyIdTokenMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: [] }),
        })),
      })),
    })),
  })),
}));

import { app } from '../../src/index';

// ---------------------------------------------------------------------------
// Limite de tamanho do corpo por rota (issue #298)
//
// O limite de 10 MB valia para todas as rotas, mas só o import de PDF em
// base64 (rota admin) precisa dele. Com ele em tudo, qualquer usuário
// autenticado podia gravar documentos enormes — quebrando a tela e inflando
// a conta do Firestore.
// ---------------------------------------------------------------------------

describe('limite de corpo das requisições', () => {
  const authHeader = 'Bearer valid-token';

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123', admin: true });
  });

  it('deve recusar corpo acima do limite padrão com 413', async () => {
    const response = await request(app)
      .post('/api/wallets')
      .set('Authorization', authHeader)
      .send({ name: 'a'.repeat(200 * 1024), currency: 'BRL' });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: 'Corpo da requisição muito grande',
    });
  });

  // O PDF da carteira do BB chega em base64 e passa de 100 KB.
  it('deve aceitar corpo grande na rota de import do PDF', async () => {
    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', authHeader)
      .send({
        fileName: 'invalido.pdf',
        contentBase64: 'A'.repeat(300 * 1024),
      });

    // Passa do limite de tamanho e falha na validação do nome do arquivo.
    expect(response.status).toBe(400);
  });
});
