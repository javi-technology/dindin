import request from 'supertest';

const verifyIdTokenMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(),
    getAll: jest.fn(async () => []),
  })),
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

import { app } from '../../src/index';
import { API_RATE_LIMIT } from '../../src/middleware/rate-limit.middleware';

// O contador é por IP e fica em memória durante todo o arquivo; cada teste
// usa um X-Forwarded-For próprio para não herdar requisições dos anteriores.
function getMe(ip: string) {
  return request(app)
    .get('/api/me')
    .set('X-Forwarded-For', ip)
    .set('Authorization', 'Bearer token-invalido');
}

describe('rate limiting global da API', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockRejectedValue(new Error('token inválido'));
  });

  it('deve responder 429 antes do authMiddleware ao exceder o limite', async () => {
    const ip = '203.0.113.10';

    for (let i = 0; i < API_RATE_LIMIT.limit; i++) {
      const response = await getMe(ip);
      expect(response.status).toBe(401);
    }
    const callsBeforeBlock = verifyIdTokenMock.mock.calls.length;

    const blocked = await getMe(ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many requests' });
    expect(verifyIdTokenMock).toHaveBeenCalledTimes(callsBeforeBlock);
  });

  it('deve contar o limite por IP do cliente (trust proxy)', async () => {
    const response = await getMe('203.0.113.11');

    expect(response.status).toBe(401);
  });

  it('não deve limitar /api/health', async () => {
    const ip = '203.0.113.12';

    for (let i = 0; i <= API_RATE_LIMIT.limit; i++) {
      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', ip);
      expect(response.status).toBe(200);
    }

    const afterHealth = await getMe(ip);
    expect(afterHealth.status).toBe(401);
  });
});
