import request from 'supertest';
import { MonthlyDividendHistory } from 'dindin-models';

const verifyIdTokenMock = jest.fn();
let firestoreMock: any;
let historyDocs: Record<string, Partial<MonthlyDividendHistory>[]>;
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
            expect(subPath).toBe('dividendHistory');
            return {
              orderBy: jest.fn((field: string, direction: string) => {
                expect(field).toBe('month');
                expect(direction).toBe('desc');
                return {
                  limit: jest.fn((value: number) => {
                    capturedLimit = value;
                    return {
                      get: jest.fn().mockResolvedValue({
                        // Um documento por mês, do mais recente ao mais antigo.
                        docs: (historyDocs[ticker] ?? [])
                          .sort((a, b) =>
                            (b.month as string).localeCompare(
                              a.month as string,
                            ),
                          )
                          .slice(0, value)
                          .map((item) => ({ data: () => ({ ...item }) })),
                      }),
                    };
                  }),
                };
              }),
            };
          }),
        })),
      };
    }),
  };
}

const entry = (
  date: string,
  monthlyDividend: unknown,
): Partial<MonthlyDividendHistory> =>
  ({
    month: date.slice(0, 7),
    date,
    monthlyDividend,
    updatedAt: `${date}T12:00:00Z`,
  }) as never;

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

  it('devolve um ponto por mês', async () => {
    // A granularidade mensal vem da escrita (um documento por mês); aqui
    // basta garantir que cada documento vira um ponto, em ordem crescente.
    historyDocs.HGLG11 = [entry('2026-03-20', 1.1), entry('2026-02-28', 0.9)];

    const response = await get('/api/quotes/HGLG11/dividend-history');

    expect(response.body.history).toEqual([
      { date: '2026-02-28', monthlyDividend: 0.9 },
      { date: '2026-03-20', monthlyDividend: 1.1 },
    ]);
  });

  it('lê apenas a quantidade de meses pedida', async () => {
    await get('/api/quotes/HGLG11/dividend-history?months=6');

    // Um documento por mês: 6 meses custam 6 leituras, não ~180.
    expect(capturedLimit).toBe(6);
  });

  it('usa 12 meses como padrão', async () => {
    await get('/api/quotes/HGLG11/dividend-history');

    expect(capturedLimit).toBe(12);
  });

  it('retorna 400 para ticker vazio', async () => {
    const response = await get('/api/quotes/%20/dividend-history');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Ticker is required and must be a non-empty string',
    });
  });

  describe('consulta em lote', () => {
    beforeEach(() => {
      historyDocs = {
        HGLG11: [entry('2026-03-20', 1.1), entry('2026-02-28', 0.9)],
        MXRF11: [entry('2026-03-15', 0.1)],
      };
    });

    it('deve devolver o histórico de vários tickers numa requisição', async () => {
      // Sem o lote, uma carteira diversificada dispara uma requisição por
      // ativo e esbarra no rate limit de 100/min por IP.
      const response = await get(
        '/api/quotes/dividend-history?tickers=HGLG11,MXRF11',
      );

      expect(response.status).toBe(200);
      expect(response.body.byTicker.HGLG11).toEqual([
        { date: '2026-02-28', monthlyDividend: 0.9 },
        { date: '2026-03-20', monthlyDividend: 1.1 },
      ]);
      expect(response.body.byTicker.MXRF11).toEqual([
        { date: '2026-03-15', monthlyDividend: 0.1 },
      ]);
    });

    it('deve normalizar e deduplicar os tickers pedidos', async () => {
      const response = await get(
        '/api/quotes/dividend-history?tickers=hglg11, HGLG11 ,mxrf11',
      );

      expect(Object.keys(response.body.byTicker).sort()).toEqual([
        'HGLG11',
        'MXRF11',
      ]);
    });

    it('deve devolver lista vazia para ticker sem histórico', async () => {
      const response = await get(
        '/api/quotes/dividend-history?tickers=HGLG11,XPLG11',
      );

      expect(response.body.byTicker.XPLG11).toEqual([]);
    });

    it('deve respeitar o parâmetro months', async () => {
      await get('/api/quotes/dividend-history?tickers=HGLG11&months=6');

      expect(capturedLimit).toBe(6);
    });

    it('deve retornar 400 sem tickers', async () => {
      const response = await get('/api/quotes/dividend-history');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Tickers is required and must be a comma-separated list',
      });
    });

    it('deve retornar 400 acima do limite de tickers por requisição', async () => {
      const tickers = Array.from({ length: 61 }, (_, i) => `T${i}`).join(',');

      const response = await get(
        `/api/quotes/dividend-history?tickers=${tickers}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Tickers must contain between 1 and 60 items',
      });
    });

    it('deve retornar 401 sem token', async () => {
      const response = await request(app).get(
        '/api/quotes/dividend-history?tickers=HGLG11',
      );

      expect(response.status).toBe(401);
    });
  });

  it('retorna 401 sem token', async () => {
    const response = await request(app).get(
      '/api/quotes/HGLG11/dividend-history',
    );

    expect(response.status).toBe(401);
  });
});
