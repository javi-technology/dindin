let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import {
  saveQuoteHistory,
  getQuoteHistory,
  getQuotePricesByTicker,
} from '../../src/quotes/quote-history.service';

describe('QuoteHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveQuoteHistory', () => {
    it('deve salvar cotação no documento principal e no histórico', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const historyDoc = jest.fn(() => ({
        set: historySet,
      }));
      const historyCollection = {
        doc: historyDoc,
      };
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => historyCollection),
      }));
      const quotesCollection = {
        doc: quoteDoc,
      };

      firestoreMock = {
        collection: jest.fn((path: string) => {
          if (path === 'quotes') return quotesCollection;
          throw new Error(`Unexpected collection: ${path}`);
        }),
      };

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi');

      // Deve criar/atualizar o documento principal quotes/HGLG11
      expect(quotesCollection.doc).toHaveBeenCalledWith('HGLG11');
      expect(quoteSet).toHaveBeenCalledWith({
        ticker: 'HGLG11',
        price: 165.5,
        monthlyDividend: 0.92,
        updatedAt: expect.any(String),
        source: 'brapi',
      });

      // Deve criar documento no histórico com ID baseado em timestamp
      expect(historyDoc).toHaveBeenCalled();
      const historyDocId = historyDoc.mock.calls[0][0];
      // Formato esperado: YYYY-MM-DDTHH-mm-ss (timestamp sem : e .)
      expect(historyDocId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);

      expect(historySet).toHaveBeenCalledWith({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        price: 165.5,
        monthlyDividend: 0.92,
        source: 'brapi',
      });
    });

    it('deve usar source padrão "brapi" quando não informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.32, 0.07);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
    });

    it('deve preservar monthlyDividend existente quando não informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'MXRF11',
            price: 10.32,
            monthlyDividend: 0.07,
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.32, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyDividend: 0.07 }),
      );
      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyDividend: 0.07 }),
      );
    });
    it('deve salvar a soma dos proventos de 12 meses no documento principal', async () => {
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('PETR4', 38.5, 1.25, 'brapi', '2026-07-15', 2.35);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ annualDividend: 2.35 }),
      );
    });

    it('deve preservar a soma de 12 meses existente quando o provento não vier', async () => {
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'PETR4',
            price: 38.5,
            monthlyDividend: 1.25,
            dividendPaymentDate: '2026-07-15',
            annualDividend: 2.35,
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('PETR4', 39, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ annualDividend: 2.35 }),
      );
    });

    it('deve salvar a data de pagamento do provento no documento principal', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('HGLG11', 165.5, 0.92, 'brapi', '2026-07-14');

      expect(quoteSet).toHaveBeenCalledWith({
        ticker: 'HGLG11',
        price: 165.5,
        monthlyDividend: 0.92,
        dividendPaymentDate: '2026-07-14',
        updatedAt: expect.any(String),
        source: 'brapi',
      });
    });

    it('deve preservar a data de pagamento existente quando o provento não é informado', async () => {
      const historySet = jest.fn().mockResolvedValue(undefined);
      const quoteSet = jest.fn().mockResolvedValue(undefined);
      const quoteDoc = jest.fn(() => ({
        set: quoteSet,
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            ticker: 'MXRF11',
            price: 10.32,
            monthlyDividend: 0.07,
            dividendPaymentDate: '2026-07-14',
            updatedAt: '2026-07-15T18:00:00Z',
            source: 'brapi',
          }),
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ set: historySet })),
        })),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      await saveQuoteHistory('MXRF11', 10.5, undefined);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyDividend: 0.07,
          dividendPaymentDate: '2026-07-14',
        }),
      );
    });
  });

  describe('getQuoteHistory', () => {
    it('deve retornar histórico ordenado por data decrescente', async () => {
      const historyDocs = [
        {
          id: '2026-07-15',
          data: () => ({
            date: '2026-07-15',
            price: 165.5,
            monthlyDividend: 0.92,
            source: 'brapi',
          }),
        },
        {
          id: '2026-07-14',
          data: () => ({
            date: '2026-07-14',
            price: 164.0,
            monthlyDividend: 0.91,
            source: 'brapi',
          }),
        },
      ];

      const orderByMock = jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: historyDocs }),
        })),
      }));

      const historyCollection = {
        orderBy: orderByMock,
      };
      const quoteDoc = jest.fn(() => ({
        collection: jest.fn(() => historyCollection),
      }));

      firestoreMock = {
        collection: jest.fn(() => ({ doc: quoteDoc })),
      };

      const result = await getQuoteHistory('HGLG11', 30);

      expect(orderByMock).toHaveBeenCalledWith('date', 'desc');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-07-15',
        price: 165.5,
        monthlyDividend: 0.92,
        source: 'brapi',
      });
      expect(result[1]).toEqual({
        date: '2026-07-14',
        price: 164.0,
        monthlyDividend: 0.91,
        source: 'brapi',
      });
    });

    it('deve usar limite padrão 30 quando não informado', async () => {
      const limitMock = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ docs: [] }),
      }));
      const orderByMock = jest.fn(() => ({ limit: limitMock }));

      firestoreMock = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({ orderBy: orderByMock })),
          })),
        })),
      };

      await getQuoteHistory('HGLG11');

      expect(limitMock).toHaveBeenCalledWith(30);
    });

    it('deve retornar array vazio quando não há histórico', async () => {
      firestoreMock = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ docs: [] }),
                })),
              })),
            })),
          })),
        })),
      };

      const result = await getQuoteHistory('TICKER_NOVO');

      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// getQuotePricesByTicker (issue #221)
// Antes, resolver o preço de N tickers custava N leituras do Firestore, uma
// por ticker. Uma carteira com 30 ativos distintos fazia 30 leituras a cada
// GET de posições. Agora vai numa única viagem via getAll().
// ---------------------------------------------------------------------------

describe('getQuotePricesByTicker', () => {
  /** Mock que registra quantas viagens ao Firestore foram feitas. */
  function createFirestoreMock(prices: Record<string, number | undefined>) {
    const getAll = jest.fn((...refs: { id: string }[]) =>
      Promise.resolve(
        refs.map((ref) => ({
          id: ref.id,
          exists: prices[ref.id] !== undefined,
          data: () => ({ ticker: ref.id, price: prices[ref.id] }),
        })),
      ),
    );

    return {
      getAll,
      collection: jest.fn((path: string) => {
        if (path !== 'quotes') throw new Error(`Unexpected: ${path}`);
        return { doc: jest.fn((id: string) => ({ id })) };
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve resolver N tickers numa única ida ao Firestore', async () => {
    const mock = createFirestoreMock({
      HGLG11: 160.5,
      XPML11: 104.2,
      MXRF11: 10.1,
    });
    firestoreMock = mock;

    const prices = await getQuotePricesByTicker(['HGLG11', 'XPML11', 'MXRF11']);

    expect(mock.getAll).toHaveBeenCalledTimes(1);
    expect(prices.get('HGLG11')).toBe(160.5);
    expect(prices.get('XPML11')).toBe(104.2);
    expect(prices.get('MXRF11')).toBe(10.1);
  });

  it('deve omitir ticker sem cotação em vez de retornar zero', async () => {
    firestoreMock = createFirestoreMock({ HGLG11: 160.5 });

    const prices = await getQuotePricesByTicker(['HGLG11', 'DESCONHECIDO11']);

    expect(prices.get('HGLG11')).toBe(160.5);
    expect(prices.has('DESCONHECIDO11')).toBe(false);
  });

  // O getAll() do Firestore rejeita chamada sem nenhum documento.
  it('não deve chamar getAll com lista vazia', async () => {
    const mock = createFirestoreMock({});
    firestoreMock = mock;

    const prices = await getQuotePricesByTicker([]);

    expect(mock.getAll).not.toHaveBeenCalled();
    expect(prices.size).toBe(0);
  });

  it('deve deduplicar tickers repetidos', async () => {
    const mock = createFirestoreMock({ HGLG11: 160.5 });
    firestoreMock = mock;

    await getQuotePricesByTicker(['HGLG11', 'HGLG11', 'HGLG11']);

    expect(mock.getAll).toHaveBeenCalledTimes(1);
    expect(mock.getAll.mock.calls[0]).toHaveLength(1);
  });

  // getAll() aceita no máximo 500 documentos por chamada.
  it('deve fatiar em lotes de 500 acima do limite', async () => {
    const tickers = Array.from({ length: 501 }, (_, i) => `TICK${i}`);
    const mock = createFirestoreMock(
      Object.fromEntries(tickers.map((t) => [t, 1])),
    );
    firestoreMock = mock;

    const prices = await getQuotePricesByTicker(tickers);

    expect(mock.getAll).toHaveBeenCalledTimes(2);
    expect(mock.getAll.mock.calls[0]).toHaveLength(500);
    expect(mock.getAll.mock.calls[1]).toHaveLength(1);
    expect(prices.size).toBe(501);
  });
});
