import request from 'supertest';
import { QuoteHistory } from 'dindin-models';

const verifyIdTokenMock = jest.fn();
let firestoreMock: any;
let historyDocs: Record<string, Partial<QuoteHistory>[]>;
let capturedCutoff: string | undefined;

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
              where: jest.fn((field: string, op: string, value: string) => {
                capturedCutoff = value;
                expect(field).toBe('date');
                expect(op).toBe('>=');
                return {
                  orderBy: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue({
                      // O Firestore devolve do mais recente para o mais antigo.
                      docs: (historyDocs[ticker] ?? [])
                        .filter((item) => (item.date as string) >= value)
                        .sort((a, b) =>
                          (b.date as string).localeCompare(a.date as string),
                        )
                        .map((item) => ({ data: () => ({ ...item }) })),
                    }),
                  })),
                };
              }),
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
    // A janela do endpoint é relativa a hoje; sem data fixa os fixtures de
    // 2026 sairiam da janela conforme o tempo passa.
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
    capturedCutoff = undefined;
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
    jest.useRealTimers();
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

  it('devolve um ponto por mês, usando o snapshot mais recente do mês', async () => {
    // O job de cotações grava um snapshot por dia; sem agregação a série
    // viraria "os últimos N dias", quase sempre com o mesmo valor.
    historyDocs.HGLG11 = [
      entry('2026-03-01', 1),
      entry('2026-03-10', 1.05),
      entry('2026-03-20', 1.1),
      entry('2026-02-28', 0.9),
    ];

    const response = await get('/api/quotes/HGLG11/dividend-history');

    expect(response.body.history).toEqual([
      { date: '2026-02-28', monthlyDividend: 0.9 },
      { date: '2026-03-20', monthlyDividend: 1.1 },
    ]);
  });

  it('usa o snapshot válido mais recente quando o último do mês é inválido', async () => {
    historyDocs.HGLG11 = [entry('2026-03-20', null), entry('2026-03-10', 1.05)];

    const response = await get('/api/quotes/HGLG11/dividend-history');

    expect(response.body.history).toEqual([
      { date: '2026-03-10', monthlyDividend: 1.05 },
    ]);
  });

  it('limita a série ao número de meses pedido', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));
    historyDocs.HGLG11 = [
      entry('2026-03-15', 1.1),
      entry('2026-02-15', 0.9),
      entry('2026-01-15', 1),
    ];

    const response = await get('/api/quotes/HGLG11/dividend-history?months=2');

    expect(response.body.history.map((item: any) => item.date)).toEqual([
      '2026-02-15',
      '2026-03-15',
    ]);

    jest.useRealTimers();
  });

  it('consulta a partir do primeiro dia do mês inicial da janela', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));

    await get('/api/quotes/HGLG11/dividend-history?months=3');

    // Janela de 3 meses terminando em março: começa em 1º de janeiro.
    expect(capturedCutoff).toBe('2026-01-01');

    jest.useRealTimers();
  });

  it('atravessa a virada de ano ao calcular a janela', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T12:00:00Z'));

    await get('/api/quotes/HGLG11/dividend-history?months=4');

    expect(capturedCutoff).toBe('2025-11-01');

    jest.useRealTimers();
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
