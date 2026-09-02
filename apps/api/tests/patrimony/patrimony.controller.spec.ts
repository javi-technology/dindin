import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const serviceMock = {
  listPatrimonySnapshots: jest.fn(),
  savePatrimonySnapshot: jest.fn(),
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
  firestore: jest.fn(() => ({})),
}));

jest.mock('../../src/patrimony/patrimony-snapshot.service', () => serviceMock);

import { app } from '../../src/index';

describe('Rotas de patrimônio', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    serviceMock.listPatrimonySnapshots.mockResolvedValue([]);
    serviceMock.savePatrimonySnapshot.mockResolvedValue({
      id: '2026-08-27',
      userId: 'user-123',
      date: '2026-08-27',
      totalWallet: 100,
      totalFridge: 20,
      total: 120,
      createdAt: '2026-08-27T00:00:00Z',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve retornar o histórico patrimonial', async () => {
    const response = await request(app)
      .get('/api/patrimony/history?limit=30')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(serviceMock.listPatrimonySnapshots).toHaveBeenCalledWith(
      'user-123',
      30,
    );
  });

  it('deve rejeitar limite inválido', async () => {
    const response = await request(app)
      .get('/api/patrimony/history?limit=0')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Limit must be an integer between 1 and 730',
    });
    expect(serviceMock.listPatrimonySnapshots).not.toHaveBeenCalled();
  });

  it('deve registrar snapshot e retornar 201', async () => {
    const response = await request(app)
      .post('/api/patrimony/snapshots')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('2026-08-27');
    expect(serviceMock.savePatrimonySnapshot).toHaveBeenCalledWith('user-123');
  });

  it('deve retornar 500 quando o serviço falhar', async () => {
    serviceMock.listPatrimonySnapshots.mockRejectedValue(new Error('falha'));

    const response = await request(app)
      .get('/api/patrimony/history')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  it('deve retornar 401 sem token', async () => {
    const response = await request(app).get('/api/patrimony/history');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });
});
