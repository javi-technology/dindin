import request from 'supertest';

const verifyIdTokenMock = jest.fn();
const serviceMock = {
  recordMonthlyDividends: jest.fn(),
};

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

jest.mock('../../src/dividend/dividend-record.service', () => serviceMock);

import { app } from '../../src/index';

describe('POST /api/dividends/record-monthly', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    serviceMock.recordMonthlyDividends.mockResolvedValue([
      {
        id: '2026-09_HGLG11',
        userId: 'user-123',
        ticker: 'HGLG11',
        amountPerShare: 0.9,
        quantity: 100,
        totalAmount: 90,
        paymentDate: '2026-09-15',
        source: 'auto',
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registra os proventos do mês e retorna 201', async () => {
    const response = await request(app)
      .post('/api/dividends/record-monthly')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(201);
    expect(response.body[0].ticker).toBe('HGLG11');
    expect(serviceMock.recordMonthlyDividends).toHaveBeenCalledWith('user-123');
  });

  it('retorna 401 sem token', async () => {
    const response = await request(app).post('/api/dividends/record-monthly');

    expect(response.status).toBe(401);
  });

  it('retorna 500 quando o serviço falha', async () => {
    serviceMock.recordMonthlyDividends.mockRejectedValue(new Error('falha'));

    const response = await request(app)
      .post('/api/dividends/record-monthly')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
