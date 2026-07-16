let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

import {
  saveQuoteHistory,
  getQuoteHistory,
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

      await saveQuoteHistory('HGLG11', 165.5, 'brapi');

      // Deve criar/atualizar o documento principal quotes/HGLG11
      expect(quotesCollection.doc).toHaveBeenCalledWith('HGLG11');
      expect(quoteSet).toHaveBeenCalledWith({
        ticker: 'HGLG11',
        price: 165.5,
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

      await saveQuoteHistory('MXRF11', 10.32);

      expect(quoteSet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
      expect(historySet).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'brapi' }),
      );
    });
  });

  describe('getQuoteHistory', () => {
    it('deve retornar histórico ordenado por data decrescente', async () => {
      const historyDocs = [
        {
          id: '2026-07-15',
          data: () => ({ date: '2026-07-15', price: 165.5, source: 'brapi' }),
        },
        {
          id: '2026-07-14',
          data: () => ({ date: '2026-07-14', price: 164.0, source: 'brapi' }),
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
        source: 'brapi',
      });
      expect(result[1]).toEqual({
        date: '2026-07-14',
        price: 164.0,
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
