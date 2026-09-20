import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const listUsersMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
    listUsers: listUsersMock,
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
import { ADMIN_RATE_LIMIT } from '../../src/middleware/rate-limit.middleware';

function listAdminUsers() {
  return request(app)
    .get('/api/admin/users')
    .set('Authorization', 'Bearer token');
}

describe('rate limiting das rotas admin', () => {
  beforeEach(() => {
    listUsersMock.mockResolvedValue({ users: [], pageToken: undefined });
  });

  it('deve responder 429 quando o admin excede o limite da janela', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });

    for (let i = 0; i < ADMIN_RATE_LIMIT.limit; i++) {
      const response = await listAdminUsers();
      expect(response.status).toBe(200);
    }

    const blocked = await listAdminUsers();

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Muitas requisições' });
  });

  it('deve contar o limite por usuário, não por IP', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-2', admin: true });

    const response = await listAdminUsers();

    expect(response.status).toBe(200);
  });
});
