const mockFetchQuotes = jest.fn();
const mockSaveQuoteHistory = jest.fn();
const mockSaveReconciledPrice = jest.fn();
const mockListActiveAssetTickers = jest.fn();
const mockGetQuotesByTicker = jest.fn();
const mockFetchMonthlyDividends = jest.fn();
const mockRecordPaidDividends = jest.fn();
const mockFetchCotahist = jest.fn();

jest.mock('../../src/quotes/cotahist', () => ({
  fetchCotahistClosingPrices: mockFetchCotahist,
}));

// A cadeia de provedores marca cada cotação com a fonte (#598). As fixtures
// sem `source` representam o provedor principal, o Yahoo.
jest.mock('../../src/quotes/quote-provider-chain', () => ({
  fetchQuotesWithFallback: async (tickers: string[]) => {
    const quotes = (await mockFetchQuotes(tickers)) as Map<
      string,
      { source?: string }
    >;
    return new Map(
      [...quotes].map(([ticker, quote]) => [
        ticker,
        { source: 'yahoo', ...quote },
      ]),
    );
  },
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
    // Sem arquivo do pregão, a reconciliação usa a cadeia de provedores.
    mockFetchCotahist.mockResolvedValue(undefined);
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
    it('deve gravar em source o provedor que forneceu o preço reconciliado', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(
        new Map([
          [
            'TRXF11',
            { price: 73.9, quotedAt: '2026-09-23T23:05:00Z', source: 'brapi' },
          ],
        ]),
      );

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).toHaveBeenCalledWith(
        'TRXF11',
        73.9,
        expect.anything(),
        '2026-09-23T23:05:00Z',
        'brapi',
      );
    });

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
        'yahoo',
      );
    });

    it('não deve consultar os provedores sem ativos no catálogo', async () => {
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

    it('deve lançar erro quando todos os provedores falham, para acionar o retry', async () => {
      const errorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockFetchQuotes.mockRejectedValue(new Error('falha na brapi'));

      await expect(reconcileClosingQuotes()).rejects.toThrow('falha na brapi');
      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  // Fechamento oficial da B3 (#600): o COTAHIST traz o preço do leilão de
  // fechamento, que o Yahoo e a Brapi nem sempre servem. Sai entre 20h30 e
  // 21h20, antes do job das 23:30.
  describe('fechamento oficial da B3 (COTAHIST)', () => {
    function official(price: number) {
      return new Map([
        ['TRXF11', { date: '2026-11-23', price, isin: 'BRTRXFCTF001' }],
      ]);
    }

    it('deve consultar o arquivo do pregão de hoje', async () => {
      mockFetchCotahist.mockResolvedValue(official(73.9));

      await reconcileClosingQuotes();

      expect(mockFetchCotahist).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('deve gravar o fechamento oficial, sem horário de apuração, com source b3-cotahist', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchCotahist.mockResolvedValue(official(73.9));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).toHaveBeenCalledWith(
        'TRXF11',
        73.9,
        expect.objectContaining({ price: 73.99 }),
        undefined,
        'b3-cotahist',
      );
    });

    it('não deve consultar os provedores quando o arquivo do pregão existe', async () => {
      mockFetchCotahist.mockResolvedValue(official(73.9));

      await reconcileClosingQuotes();

      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });

    it('não deve regravar quando o preço gravado já é o fechamento oficial', async () => {
      mockGetQuotesByTicker.mockResolvedValue(storedQuote(73.9));
      mockFetchCotahist.mockResolvedValue(official(73.9));

      await reconcileClosingQuotes();

      expect(mockSaveReconciledPrice).not.toHaveBeenCalled();
    });

    it('deve avisar os tickers do catálogo ausentes do arquivo', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'TRXF11', assetType: 'FII' },
        { ticker: 'XPTO11', assetType: 'FII' },
      ]);
      mockFetchCotahist.mockResolvedValue(official(73.9));

      await reconcileClosingQuotes();

      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'reconcileQuotes.tickersWithoutClose',
        expect.objectContaining({ tickers: ['XPTO11'] }),
      );
    });

    it('deve usar a cadeia de provedores e avisar quando o arquivo não existe', async () => {
      mockGetQuotesByTicker.mockResolvedValue(
        storedQuote(73.99, '2026-09-23T21:31:00Z'),
      );
      mockFetchQuotes.mockResolvedValue(fetched(73.9, '2026-09-23T23:05:00Z'));

      await reconcileClosingQuotes();

      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'reconcileQuotes.cotahistUnavailable',
        expect.objectContaining({ date: expect.any(String) }),
      );
      expect(mockSaveReconciledPrice).toHaveBeenCalledWith(
        'TRXF11',
        73.9,
        expect.anything(),
        '2026-09-23T23:05:00Z',
        'yahoo',
      );
    });

    it('deve usar a cadeia de provedores e avisar quando a B3 falha', async () => {
      mockFetchCotahist.mockRejectedValue(new Error('B3 fora do ar'));
      mockFetchQuotes.mockResolvedValue(new Map());

      await expect(reconcileClosingQuotes()).resolves.toBeUndefined();

      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'reconcileQuotes.cotahistFailed',
        expect.objectContaining({ message: 'B3 fora do ar' }),
      );
      expect(mockFetchQuotes).toHaveBeenCalled();
    });
  });
});
