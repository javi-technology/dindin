let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import {
  getMonthlyDividendHistory,
  saveQuoteHistory,
} from '../../src/quotes/quote-history.service';

interface Captured {
  docIds: string[];
  saved: unknown[];
}

/**
 * Mock que distingue as duas subcoleções de `quotes/{ticker}`: `history`
 * (snapshot diário) e `dividendHistory` (um documento por mês).
 */
function createFirestoreMock(
  dividendDocs: { month: string; monthlyDividend: number; date: string }[] = [],
): {
  captured: Record<string, Captured>;
  state: { capturedLimit?: number };
} {
  const captured: Record<string, Captured> = {
    history: { docIds: [], saved: [] },
    dividendHistory: { docIds: [], saved: [] },
  };
  const state: { capturedLimit?: number } = {};

  firestoreMock = {
    collection: jest.fn((path: string) => {
      if (path !== 'quotes') {
        throw new Error(`Unexpected collection: ${path}`);
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ data: () => undefined }),
          set: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn((subPath: string) => ({
            doc: jest.fn((docId: string) => {
              captured[subPath].docIds.push(docId);
              return {
                set: jest.fn((data: unknown) => {
                  captured[subPath].saved.push(data);
                  return Promise.resolve();
                }),
              };
            }),
            orderBy: jest.fn(() => ({
              limit: jest.fn((value: number) => {
                state.capturedLimit = value;
                return {
                  get: jest.fn().mockResolvedValue({
                    docs: [...dividendDocs]
                      .sort((a, b) => b.month.localeCompare(a.month))
                      .slice(0, value)
                      .map((item) => ({ data: () => ({ ...item }) })),
                  }),
                };
              }),
            })),
          })),
        })),
      };
    }),
  };

  return { captured, state };
}

describe('histórico mensal de proventos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('gravação pelo job de cotações', () => {
    it('deve gravar o provento do mês em um documento por mês', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi', '2026-03-15');

      expect(mock.captured.dividendHistory.docIds).toEqual(['2026-03']);
      expect(mock.captured.dividendHistory.saved[0]).toEqual({
        month: '2026-03',
        date: '2026-03-15',
        monthlyDividend: 0.92,
        updatedAt: expect.any(String),
      });
    });

    it('deve usar o mês do pagamento, não o mês em que o job rodou', async () => {
      const mock = createFirestoreMock();

      // A Brapi devolve sempre o último provento anunciado. Num pagador
      // trimestral, o job de abril e o de maio ainda veem o provento pago em
      // março: chavear pelo mês da execução criaria três pagamentos onde
      // houve um.
      await saveQuoteHistory('ITSA4', 11.2, 0.2, 'brapi', '2026-01-15');

      expect(mock.captured.dividendHistory.docIds).toEqual(['2026-01']);
      expect(mock.captured.dividendHistory.saved[0]).toEqual({
        month: '2026-01',
        date: '2026-01-15',
        monthlyDividend: 0.2,
        updatedAt: expect.any(String),
      });
    });

    it('deve cair no mês corrente quando não há data de pagamento', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi');

      expect(mock.captured.dividendHistory.docIds).toEqual(['2026-03']);
    });

    it('deve ignorar data de pagamento em formato inválido', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi', '15/03/2026');

      expect(mock.captured.dividendHistory.docIds).toEqual(['2026-03']);
    });

    it('deve sobrescrever o documento do mês a cada execução', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi');
      await saveQuoteHistory('HGLG11', 166, 0.95, 'brapi');

      // Mesmo id nas duas execuções: o mês não acumula um doc por dia.
      expect(mock.captured.dividendHistory.docIds).toEqual([
        '2026-03',
        '2026-03',
      ]);
      expect(mock.captured.dividendHistory.saved).toHaveLength(2);
    });

    it('deve seguir gravando o snapshot diário em history', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi');

      expect(mock.captured.history.saved).toHaveLength(1);
      expect(mock.captured.history.docIds[0]).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
      );
    });

    it('não deve gravar o mês quando o provento não é numérico', async () => {
      const mock = createFirestoreMock();

      await saveQuoteHistory(
        'HGLG11',
        165.5,
        Number.NaN as unknown as number,
        'brapi',
      );

      expect(mock.captured.dividendHistory.saved).toHaveLength(0);
    });
  });

  describe('getMonthlyDividendHistory', () => {
    it('deve devolver os meses em ordem crescente', async () => {
      createFirestoreMock([
        { month: '2026-01', monthlyDividend: 1, date: '2026-01-31' },
        { month: '2026-03', monthlyDividend: 1.1, date: '2026-03-20' },
        { month: '2026-02', monthlyDividend: 0.9, date: '2026-02-28' },
      ]);

      const history = await getMonthlyDividendHistory('HGLG11', 12);

      expect(history.map((item) => item.month)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
      ]);
    });

    it('deve ler apenas a quantidade de meses pedida', async () => {
      const mock = createFirestoreMock([
        { month: '2026-01', monthlyDividend: 1, date: '2026-01-31' },
        { month: '2026-02', monthlyDividend: 0.9, date: '2026-02-28' },
        { month: '2026-03', monthlyDividend: 1.1, date: '2026-03-20' },
      ]);

      const history = await getMonthlyDividendHistory('HGLG11', 2);

      // Um documento por mês: o limite da query é exato, sem varrer os dias.
      expect(mock.state.capturedLimit).toBe(2);
      expect(history.map((item) => item.month)).toEqual(['2026-02', '2026-03']);
    });
  });
});
