import request from 'supertest';
import { QuoteHistory } from 'dindin-models';

const verifyIdTokenMock = jest.fn();
let firestoreMock: any;
let historyDocs: Record<string, Partial<QuoteHistory>[]>;
let capturedLimit: number | undefined;

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
  getFirestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';

function createFirestoreMock() {
  return {
    collection: jest.fn((path: string) => {
      if (path !== 'quotes') {
        throw new Error(`Unexpected collection: ${path}`);
      }

      return {
        doc: jest.fn((ticker: string) => ({
          collection: jest.fn((subPath: string) => {
            if (subPath !== 'history') {
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }

            return {
              orderBy: jest.fn(() => ({
                limit: jest.fn((value: number) => {
                  capturedLimit = value;
                  return {
                    get: jest.fn().mockResolvedValue({
                      // O Firestore devolve do mais recente para o mais antigo.
                      docs: (historyDocs[ticker] ?? []).map((item) => ({
                        data: () => ({ ...item }),
                      })),
                    }),
                  };
                }),
              })),
            };
          }),
        })),
      };
    }),
  };
}

const entry = (date: string, monthlyDividend: unknown): Partial<QuoteHistory> =>
  ({ date, price: 100, monthlyDividend, source: 'brapi' }) as never;

describe('GET /api/quotes/:ticker/dividend-history', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    capturedLimit = undefined;
    historyDocs = {
      HGLG11: [
        entry('2026-03-15', 1.1),
        entry('2026-02-15', 0.9),
        entry('2026-01-15', 1),
      ],
    };
    firestoreMock = createFirestoreMock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const get = (url: string) =>
    request(app).get(url).set('Authorization', 'Bearer valid-token');

  it('retorna o histórico em ordem cronológica crescente', async () => {
    const response = await get('/api/quotes/HGLG11/dividend-history');

    expect(response.status).toBe(200);
    expect(response.body.ticker).toBe('HGLG11');
    expect(response.body.history).toEqual([
      { date: '2026-01-15', monthlyDividend: 1 },
      { date: '2026-02-15', monthlyDividend: 0.9 },
      { date: '2026-03-15', monthlyDividend: 1.1 },
    ]);
  });

  it('normaliza o ticker para maiúsculas', async () => {
    const response = await get('/api/quotes/hglg11/dividend-history');

    expect(response.status).toBe(200);
    expect(response.body.ticker).toBe('HGLG11');
    expect(response.body.history.length).toBe(3);
  });

  it('retorna histórico vazio para ticker sem registros', async () => {
    const response = await get('/api/quotes/XPLG11/dividend-history');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ticker: 'XPLG11', history: [] });
  });

  it('descarta registros sem provento numérico', async () => {
    historyDocs.HGLG11 = [
      entry('2026-03-15', 1.1),
      entry('2026-02-15', null),
      entry('2026-01-15', 'abc'),
    ];

    const response = await get('/api/quotes/HGLG11/dividend-history');

    expect(response.body.history).toEqual([
      { date: '2026-03-15', monthlyDividend: 1.1 },
    ]);
  });

  it('usa 12 meses como padrão', async () => {
    await get('/api/quotes/HGLG11/dividend-history');

    expect(capturedLimit).toBe(12);
  });

  it('respeita o parâmetro months', async () => {
    await get('/api/quotes/HGLG11/dividend-history?months=24');

    expect(capturedLimit).toBe(24);
  });

  it.each(['abc', '0', '61', '-1', '1.5'])(
    'retorna 400 para months inválido: %s',
    async (months) => {
      const response = await get(
        `/api/quotes/HGLG11/dividend-history?months=${months}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Months must be an integer between 1 and 60',
      });
    },
  );

  it('retorna 400 para ticker vazio', async () => {
    const response = await get('/api/quotes/%20/dividend-history');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Ticker is required and must be a non-empty string',
    });
  });

  it('retorna 401 sem token', async () => {
    const response = await request(app).get(
      '/api/quotes/HGLG11/dividend-history',
    );

    expect(response.status).toBe(401);
  });
});
