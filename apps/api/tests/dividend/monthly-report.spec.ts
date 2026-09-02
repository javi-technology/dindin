import request from 'supertest';
import { Dividend } from 'dindin-models';

const verifyIdTokenMock = jest.fn();
let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
  firestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';

const dividend = (overrides: Partial<Dividend> = {}): Dividend =>
  ({
    id: 'dividend-1',
    userId: 'user-123',
    ticker: 'HGLG11',
    amountPerShare: 1,
    quantity: 100,
    totalAmount: 100,
    paymentDate: '2026-01-15',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as Dividend;

function createFirestoreMock(dividends: Dividend[] = []) {
  return {
    collection: jest.fn((path: string) => {
      if (path !== 'users') {
        throw new Error(`Unexpected collection: ${path}`);
      }

      return {
        doc: jest.fn((userId: string) => ({
          collection: jest.fn((subPath: string) => {
            if (userId !== 'user-123' || subPath !== 'dividends') {
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }

            return {
              get: jest.fn().mockResolvedValue({
                docs: dividends.map((item) => ({
                  id: item.id,
                  data: () => ({ ...item }),
                })),
              }),
            };
          }),
        })),
      };
    }),
  };
}

describe('GET /api/dividends/monthly-report', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    firestoreMock = createFirestoreMock([
      dividend({ paymentDate: '2026-01-15', totalAmount: 100 }),
      dividend({
        id: 'dividend-2',
        ticker: 'XPLG11',
        paymentDate: '2025-02-15',
        totalAmount: 50,
      }),
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retorna o relatório agrupado para o ano informado', async () => {
    const response = await request(app)
      .get('/api/dividends/monthly-report?year=2026')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.year).toBe(2026);
    expect(response.body.months).toEqual([
      {
        month: '2026-01',
        total: 100,
        byTicker: [{ ticker: 'HGLG11', total: 100 }],
      },
    ]);
    expect(response.body.availableYears).toEqual([2026, 2025]);
  });

  it('usa o ano atual quando o filtro não é informado', async () => {
    const response = await request(app)
      .get('/api/dividends/monthly-report')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.year).toBe(new Date().getFullYear());
  });

  it.each(['abc', '1800'])(
    'retorna 400 para ano inválido: %s',
    async (year) => {
      const response = await request(app)
        .get(`/api/dividends/monthly-report?year=${year}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Year must be an integer between 1900 and 2100',
      });
    },
  );

  it('retorna 401 sem token', async () => {
    const response = await request(app).get('/api/dividends/monthly-report');

    expect(response.status).toBe(401);
  });

  it('retorna 500 quando a leitura do Firestore falha', async () => {
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error('Firestore down')),
          })),
        })),
      })),
    };

    const response = await request(app)
      .get('/api/dividends/monthly-report?year=2026')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
