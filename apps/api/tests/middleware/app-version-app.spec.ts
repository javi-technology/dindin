import request from 'supertest';

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));
jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({ collection: jest.fn() })),
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));

import { app } from '../../src/index';

describe('versão mínima do app na API', () => {
  const original = process.env.APP_MIN_VERSION;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_MIN_VERSION;
    else process.env.APP_MIN_VERSION = original;
  });

  it('deve recusar o app antigo em /api/* antes da autenticação', async () => {
    process.env.APP_MIN_VERSION = '2.0.0';

    const response = await request(app)
      .get('/api/me')
      .set('X-App-Version', '1.0.0');

    expect(response.status).toBe(426);
    expect(response.body.code).toBe('APP_UPDATE_REQUIRED');
  });

  it('deve manter /api/health aberto para qualquer versão', async () => {
    process.env.APP_MIN_VERSION = '2.0.0';

    const response = await request(app)
      .get('/api/health')
      .set('X-App-Version', '1.0.0');

    expect(response.status).toBe(200);
  });

  it('deve deixar o app na versão mínima seguir para a autenticação', async () => {
    process.env.APP_MIN_VERSION = '2.0.0';

    const response = await request(app)
      .get('/api/me')
      .set('X-App-Version', '2.0.0');

    expect(response.status).toBe(401);
  });
});
