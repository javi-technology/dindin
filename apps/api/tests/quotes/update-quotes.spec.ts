const mockFetchQuotes = jest.fn();
const mockSaveQuoteHistory = jest.fn();

jest.mock('../../src/quotes/brapi.service', () => ({
  fetchQuotes: mockFetchQuotes,
}));

jest.mock('../../src/quotes/quote-history.service', () => ({
  saveQuoteHistory: mockSaveQuoteHistory,
}));

let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

import { updateAllQuotes } from '../../src/quotes/update-quotes.handler';

describe('UpdateQuotesHandler — updateAllQuotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createPositionDoc(ticker: string, currentPrice?: number) {
    return {
      id: `pos-${ticker}`,
      ref: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      data: () => ({
        ticker,
        quantity: 10,
        averagePrice: 100,
        currentPrice,
        assetType: 'FII',
      }),
    };
  }

  function mockCollectionGroup(docs: ReturnType<typeof createPositionDoc>[]) {
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const batchUpdate = jest.fn();
    const batchMock = {
      update: batchUpdate,
      commit: batchCommit,
    };

    firestoreMock = {
      collectionGroup: jest.fn((name: string) => {
        if (name === 'positions') {
          return {
            get: jest.fn().mockResolvedValue({ docs }),
            where: jest.fn((field: string, _op: string, value: string) => ({
              get: jest.fn().mockResolvedValue({
                docs: docs.filter((d) => d.data().ticker === value),
              }),
            })),
          };
        }
        throw new Error(`Unexpected collectionGroup: ${name}`);
      }),
      batch: jest.fn(() => batchMock),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              set: jest.fn().mockResolvedValue(undefined),
            })),
          })),
        })),
      })),
    };

    return { batchMock, batchUpdate, batchCommit };
  }

  describe('sem posições', () => {
    it('não deve chamar a API quando não há posições', async () => {
      mockCollectionGroup([]);

      await updateAllQuotes();

      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });
  });

  describe('com posições', () => {
    it('deve buscar cotações apenas para tickers únicos', async () => {
      const docs = [
        createPositionDoc('HGLG11'),
        createPositionDoc('HGLG11'), // duplicado
        createPositionDoc('MXRF11'),
      ];
      mockCollectionGroup(docs);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(mockFetchQuotes).toHaveBeenCalledTimes(1);
      const tickers = mockFetchQuotes.mock.calls[0][0];
      expect(tickers).toHaveLength(2);
      expect(tickers).toContain('HGLG11');
      expect(tickers).toContain('MXRF11');
    });

    it('deve atualizar currentPrice em todas as posições do ticker', async () => {
      const docs = [createPositionDoc('HGLG11'), createPositionDoc('HGLG11')];
      const { batchUpdate, batchCommit } = mockCollectionGroup(docs);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(batchUpdate).toHaveBeenCalledTimes(2);
      expect(batchCommit).toHaveBeenCalled();
    });

    it('deve salvar histórico para cada ticker atualizado', async () => {
      const docs = [createPositionDoc('HGLG11'), createPositionDoc('MXRF11')];
      mockCollectionGroup(docs);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(2);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        'brapi',
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        'brapi',
      );
    });

    it('não deve quebrar quando um ticker não tem cotação na Brapi', async () => {
      const docs = [
        createPositionDoc('HGLG11'),
        createPositionDoc('TICKER_INEXISTENTE'),
      ];
      mockCollectionGroup(docs);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      // Deve atualizar apenas HGLG11
      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(1);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        'brapi',
      );
    });

    it('deve continuar processando outros tickers quando um falha', async () => {
      const docs = [createPositionDoc('HGLG11'), createPositionDoc('MXRF11')];
      mockCollectionGroup(docs);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      // Faz o saveQuoteHistory falhar para HGLG11
      mockSaveQuoteHistory.mockRejectedValueOnce(new Error('Firestore error'));

      await updateAllQuotes();

      // MXRF11 deve ter sido salvo mesmo com falha no HGLG11
      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(2);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        'brapi',
      );
    });
  });

  describe('erro na Brapi', () => {
    it('deve logar erro e não quebrar quando a Brapi falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const docs = [createPositionDoc('HGLG11')];
      mockCollectionGroup(docs);
      mockFetchQuotes.mockRejectedValue(new Error('Brapi API error'));

      await updateAllQuotes();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[updateAllQuotes] error:',
        expect.objectContaining({ message: 'Brapi API error' }),
      );
      expect(mockSaveQuoteHistory).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
