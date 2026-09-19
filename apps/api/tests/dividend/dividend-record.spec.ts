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
  getFirestore: jest.fn(() => ({})),
}));

import { app } from '../../src/index';

// O registro de proventos passou a ser feito pelo sync diário de cotações
// (#112): não há mais registro mensal disparado pelo usuário.
describe('POST /api/dividends/record-monthly', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  it('não existe mais', async () => {
    const response = await request(app)
      .post('/api/dividends/record-monthly')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });
});
