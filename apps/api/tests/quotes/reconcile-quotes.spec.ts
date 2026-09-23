const mockFetchQuotes = jest.fn();
const mockSaveQuoteHistory = jest.fn();
const mockSaveReconciledPrice = jest.fn();
const mockListActiveAssetTickers = jest.fn();
const mockGetQuotesByTicker = jest.fn();
const mockFetchMonthlyDividends = jest.fn();
const mockRecordPaidDividends = jest.fn();

jest.mock('../../src/quotes/brapi.service', () => ({
  fetchQuotes: mockFetchQuotes,
}));

jest.mock('../../src/quotes/dividend-fetch.service', () => ({
  fetchMonthlyDividends: mockFetchMonthlyDividends,
}));

jest.mock('../../src/quotes/quote-history.service', () => ({
  saveQuoteHistory: mockSaveQuoteHistory,
  saveReconciledPrice: mockSaveReconciledPrice,
}));

jest.mock('../../src/quotes/quote-prices', () => ({
  getQuotesByTicker: mockGetQuotesByTicker,
}));

jest.mock('../../src/dividend/dividend-sync-record.service', () => ({
  recordPaidDividends: mockRecordPaidDividends,
}));

jest.mock('../../src/assets/asset.service', () => ({
  listActiveAssetTickers: mockListActiveAssetTickers,
}));

jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { reconcileClosingQuotes } from '../../src/quotes/reconcile-quotes.handler';

// ---------------------------------------------------------------------------
// Reconciliação noturna do preço de fechamento (issue #389)
//
// Nos horários dos jobs diários a Brapi ainda podia servir o último negócio do
// pregão contínuo. A reconciliação volta mais tarde e corrige só o preço —
// sem registrar proventos nem tirar foto de data-com, que varreriam todos os
// usuários de novo — e só quando a fonte de fato apurou depois.
// ---------------------------------------------------------------------------

describe('reconcileClosingQuotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListActiveAssetTickers.mockResolvedValue([
      { ticker: 'TRXF11', assetType: 'FII' },
    ]);
    mockGetQuotesByTicker.mockResolvedValue(new Map());
    mockSaveReconciledPrice.mockResolvedValue(undefined);
  });

  function storedQuote(price: number, quotedAt?: string) {
    return new Map([
      [
        'TRXF11',
        {
          ticker: 'TRXF11',
          price,
          monthlyDividend: 0.7,
          updatedAt: '2026-09-23T22:30:00Z',
          ...(quotedAt && { quotedAt }),
          source: 'brapi',
        },
      ],
    ]);
  }

  function fetched(price: number, quotedAt?: string) {
    return new Map([['TRXF11', { price, ...(quotedAt && { quotedAt }) }]]);
  }

  describe('sobrescrita do preço', () => {
    it('deve gravar o preço quando a apuração da fonte é mais recente que a gravada', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).toHaveBeenCalledTimes(1);
      const [ticker, price, , quotedAt] = mockSaveReconciledPrice.mock.calls[0];
      expect(ticker).toBe('TRXF11');
      expect(price).toBe(73.9);
      expect(quotedAt).toBe('2026-09-23T23:05:00Z');
    });

    it('não deve sobrescrever quando a apuração é igual à gravada', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.99, '2026-09-23T21:31:00Z'));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();
    });

    it('não deve sobrescrever um fechamento por um dado em cache mais antigo', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.9, '2026-09-23T23:05:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.99, '2026-09-23T21:31:00Z'));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();
    });

    it('não deve sobrescrever quando a fonte não informa o horário de apuração', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();
    });

    it('deve gravar quando a cotação guardada não tem horário de apuração', async () => {
      mockGetQuotesByTicker.mockResolvedValue(storedQuote(73.99));
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).toHaveBeenCalledTimes(1);
    });
  });

  describe('escopo do job', () => {
    it('não deve registrar proventos nem consultar a agenda de proventos', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(mockRecordPaidDividends).not.toHaveBeenCalled();
      expect(mockFetchMonthlyDividends).not.toHaveBeenCalled();
    });

    // `saveQuoteHistory` regrava o documento mensal de proventos junto com o
    // preço. Usá-lo aqui reescreveria esse registro toda noite, com
    // `updatedAt` novo e nenhum provento novo por trás.
    it('deve gravar pelo caminho que não toca no histórico de proventos', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(mockSaveQuoteHistory).not.toHaveBeenCalled();
      expect(mockSaveReconciledPrice).toHaveBeenCalledWith(
        'TRXF11',
        73.9,
        expect.objectContaining({ price: 73.99 }),
        '2026-09-23T23:05:00Z',
        'brapi',
      );
    });

    it('não deve consultar a Brapi sem ativos no catálogo', async () => {
      mockListActiveAssetTickers.mockResolvedValue([]);

      await reconcileClosingQuotes();

      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });
  });

  describe('log da reconciliação', () => {
    it('deve registrar preço anterior, preço novo e diferença por ticker', async () => {
      const infoSpy = jest
        .spyOn(functionsLogger, 'info')
        .mockImplementation(() => {});
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(infoSpy).toHaveBeenCalledWith(
        'reconcileQuotes.priceReconciled',
        expect.objectContaining({
          ticker: 'TRXF11',
          previousPrice: 73.99,
          price: 73.9,
          difference: expect.closeTo(-0.09, 5),
        }),
      );

      infoSpy.mockRestore();
    });
  });

  describe('falhas', () => {
    it('deve reconciliar os demais tickers quando a gravação de um falha', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'TRXF11', assetType: 'FII' },
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);
      mockGetQuotesByTicker.mockResolvedValue(
        new Map([
          ['TRXF11', { ticker: 'TRXF11', price: 73.99, source: 'brapi' }],
          ['HGLG11', { ticker: 'HGLG11', price: 165.0, source: 'brapi' }],
        ]),
      );
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['TRXF11', { price: 73.9, quotedAt: '2026-09-23T23:05:00Z' }],
          ['HGLG11', { price: 165.5, quotedAt: '2026-09-23T23:05:00Z' }],
        ]),
      );
      mockSaveReconciledPrice.mockImplementation(async (ticker: string) => {
        if (ticker === 'TRXF11') throw new Error('Firestore indisponível');
      });
      const errorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});

      await expect(reconcileClosingQuotes()).resolves.toBeUndefined();

      expect(mockSaveReconciledPrice).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        'reconcileQuotes.tickerFailed',
        expect.objectContaining({ ticker: 'TRXF11' }),
      );

      errorSpy.mockRestore();
    });

    it('deve lançar erro quando a Brapi falha por completo, para acionar o retry', async () => {
      const errorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockFetchQuotes.mockRejectedValue(new Error('Brapi API error'));

      await expect(reconcileClosingQuotes()).rejects.toThrow('Brapi API error');
      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
