import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const firebaseLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('firebase-functions/logger', () => firebaseLogger);

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

let firestoreMock: any;

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';

// ---------------------------------------------------------------------------
// Log de requisições (issue #324)
//
// O middleware embrulhava `res.json`, então só via respostas com corpo JSON:
// os 204 de todas as exclusões e os 401 do authMiddleware sumiam do log —
// justamente o que se procura ao investigar "sumiu a posição" ou "o usuário
// diz que não consegue entrar".
// ---------------------------------------------------------------------------

function requestLogs() {
  return firebaseLogger.info.mock.calls.filter(
    ([event]) => event === 'request',
  );
}

describe('log de requisições', () => {
  const authHeader = 'Bearer valid-token';

  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ docs: [] }),
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ exists: false }),
            })),
          })),
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      })),
    };
  });

  it('deve registrar resposta com corpo JSON', async () => {
    await request(app).get('/api/health');

    expect(requestLogs()[0][1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/health',
        status: 200,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('deve registrar 401 de requisição sem token', async () => {
    await request(app).get('/api/wallets');

    expect(requestLogs()[0][1]).toEqual(
      expect.objectContaining({ path: '/api/wallets', status: 401 }),
    );
  });

  it('deve registrar resposta sem corpo, como a exclusão', async () => {
    await request(app)
      .delete('/api/wallets/wallet-inexistente')
      .set('Authorization', authHeader);

    expect(requestLogs()[0][1]).toEqual(
      expect.objectContaining({
        method: 'DELETE',
        path: '/api/wallets/wallet-inexistente',
        status: 404,
      }),
    );
  });

  it('deve registrar o uid quando a requisição está autenticada', async () => {
    await request(app).get('/api/wallets').set('Authorization', authHeader);

    expect(requestLogs()[0][1]).toEqual(
      expect.objectContaining({ uid: 'user-123' }),
    );
  });

  it('não deve usar console.log', async () => {
    const consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await request(app).get('/api/health');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // O webhook é registrado antes do logger para receber o corpo cru; com isso
  // ficava fora do log — justo a rota onde assinatura inválida e evento
  // antigo são descartados com 400/500.
  it('deve registrar a resposta do webhook da Stripe', async () => {
    await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(requestLogs()[0]?.[1]).toEqual(
      expect.objectContaining({ path: '/api/billing/webhook' }),
    );
  });
});
