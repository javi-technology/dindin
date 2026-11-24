const mockFetchQuotes = jest.fn();
const mockSaveQuoteHistory = jest.fn();
const mockListActiveAssetTickers = jest.fn();
const mockFetchMonthlyDividends = jest.fn();
const mockRecordPaidDividends = jest.fn();

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

import { updateAllQuotes } from '../../src/quotes/update-quotes.handler';

describe('UpdateQuotesHandler — updateAllQuotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMonthlyDividends.mockResolvedValue(new Map());
    mockRecordPaidDividends.mockResolvedValue([]);
  });

  describe('sem ativos no catálogo', () => {
    it('não deve consultar os provedores quando não há ativos cadastrados', async () => {
      mockListActiveAssetTickers.mockResolvedValue([]);

      await updateAllQuotes();

      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });
  });

  describe('com ativos no catálogo', () => {
    function mockAssets() {
      return [
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'MXRF11', assetType: 'FII' },
      ];
    }

    it('deve buscar cotações para os tickers ativos do catálogo', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(mockFetchQuotes).toHaveBeenCalledTimes(1);
      expect(mockFetchQuotes).toHaveBeenCalledWith(['HGLG11', 'MXRF11']);
    });

    it('deve buscar dividendos mensais por assetType', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92 }],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      await updateAllQuotes();

      expect(mockFetchMonthlyDividends).toHaveBeenCalledTimes(1);
      expect(mockFetchMonthlyDividends).toHaveBeenCalledWith(mockAssets());
    });

    it('deve salvar histórico com o dividendo mensal para cada ticker atualizado', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92 }],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(2);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        0.92,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        0.07,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve salvar a soma dos proventos de 12 meses junto com o histórico', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          [
            'HGLG11',
            {
              monthlyDividend: 0.92,
              paymentDate: '2026-07-14',
              annualDividend: 10.8,
            },
          ],
        ]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        0.92,
        'yahoo',
        '2026-07-14',
        10.8,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve registrar os proventos pagos de cada ticker com eventos', async () => {
      const paidEvents = [{ paymentDate: '2026-07-14', rate: 0.92 }];
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          [
            'HGLG11',
            {
              monthlyDividend: 0.92,
              paymentDate: '2026-07-14',
              annualDividend: 0.92,
              paidEvents,
            },
          ],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      await updateAllQuotes();

      expect(mockRecordPaidDividends).toHaveBeenCalledTimes(1);
      expect(mockRecordPaidDividends).toHaveBeenCalledWith(
        'HGLG11',
        paidEvents,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('deve enviar ao registro os anunciados com data-com (#278)', async () => {
      const paidEvents = [
        { paymentDate: '2026-07-14', rate: 0.92, comDate: '2026-06-30' },
      ];
      const upcomingEvents = [
        { paymentDate: '2026-08-14', rate: 0.95, comDate: '2026-07-31' },
      ];
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92, paidEvents, upcomingEvents }],
          // Só anunciado: ainda precisa da foto na data-com.
          [
            'MXRF11',
            {
              monthlyDividend: 0.07,
              upcomingEvents: [
                {
                  paymentDate: '2026-08-14',
                  rate: 0.07,
                  comDate: '2026-07-31',
                },
              ],
            },
          ],
        ]),
      );

      await updateAllQuotes();

      expect(mockRecordPaidDividends).toHaveBeenCalledWith(
        'HGLG11',
        [...paidEvents, ...upcomingEvents],
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      expect(mockRecordPaidDividends).toHaveBeenCalledWith(
        'MXRF11',
        [{ paymentDate: '2026-08-14', rate: 0.07, comDate: '2026-07-31' }],
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('deve logar e seguir quando o registro de proventos de um ticker falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      jest.spyOn(functionsLogger, 'log').mockImplementation(() => {});
      const paidEvents = [{ paymentDate: '2026-07-14', rate: 0.5 }];
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92, paidEvents }],
          ['MXRF11', { monthlyDividend: 0.07, paidEvents }],
        ]),
      );
      mockRecordPaidDividends
        .mockRejectedValueOnce(new Error('falha no registro'))
        .mockResolvedValueOnce([]);

      await expect(updateAllQuotes()).resolves.toBeUndefined();

      expect(mockRecordPaidDividends).toHaveBeenCalledTimes(2);
      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'updateAllQuotes.dividendFailed',
        { ticker: 'HGLG11', message: 'falha no registro' },
      );
      consoleErrorSpy.mockRestore();
    });

    it('deve salvar a data de pagamento do provento junto com o histórico', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          [
            'HGLG11',
            {
              monthlyDividend: 0.92,
              paymentDate: '2026-07-14',
              comDate: '2026-06-30',
            },
          ],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      await updateAllQuotes();

      // A data-com vai junto: é a que a agenda usa (#562).
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        0.92,
        'yahoo',
        '2026-07-14',
        undefined,
        '2026-07-15T18:00:00Z',
        '2026-06-30',
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        0.07,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve preservar dividendo mensal existente quando a Brapi não retorna o valor', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(new Map());

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        undefined,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve consultar ações e FIIs do catálogo em uma única chamada à cadeia de provedores', async () => {
      const assets = [
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'PETR4', assetType: 'STOCK' },
        { ticker: 'BOVA11', assetType: 'ETF' },
      ];
      mockListActiveAssetTickers.mockResolvedValue(assets);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['PETR4', { price: 48.92, quotedAt: '2026-07-15T18:00:00Z' }],
          ['BOVA11', { price: 182.55, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(mockFetchQuotes).toHaveBeenCalledTimes(1);
      expect(mockFetchQuotes).toHaveBeenCalledWith([
        'HGLG11',
        'PETR4',
        'BOVA11',
      ]);
      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(3);
    });

    it('deve logar os tickers que ficaram sem cotação nos provedores', async () => {
      const consoleWarnSpy = jest
        .spyOn(functionsLogger, 'warn')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'updateAllQuotes.tickersWithoutQuote',
        { tickers: ['MXRF11'] },
      );

      consoleWarnSpy.mockRestore();
    });

    it('não deve quebrar quando um ticker do catálogo não tem cotação nos provedores', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'TICKER_INEXISTENTE', assetType: 'OTHER' },
      ]);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([['HGLG11', { monthlyDividend: 0.92 }]]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(1);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        0.92,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve continuar processando outros tickers quando um falha ao salvar', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92 }],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      mockSaveQuoteHistory.mockRejectedValueOnce(new Error('Firestore error'));

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(2);
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        0.07,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );
    });

    it('deve logar erro e continuar quando a busca de dividendos falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, quotedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockRejectedValue(
        new Error('Dividends API error'),
      );

      await updateAllQuotes();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'updateAllQuotes.dividendsFailed',
        expect.objectContaining({ message: 'Dividends API error' }),
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        undefined,
        'yahoo',
        undefined,
        undefined,
        '2026-07-15T18:00:00Z',
        undefined,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('catálogo maior que o tamanho do lote', () => {
    it('deve processar todos os tickers mesmo havendo mais do que um lote', async () => {
      const assets = Array.from({ length: 25 }, (_, i) => ({
        ticker: `TICKER${i}11`,
        assetType: 'FII' as const,
      }));
      const tickers = assets.map((a) => a.ticker);
      mockListActiveAssetTickers.mockResolvedValue(assets);
      mockFetchQuotes.mockResolvedValue(
        new Map(
          tickers.map((ticker, i) => [
            ticker,
            { price: 10 + i, quotedAt: '2026-07-15T18:00:00Z' },
          ]),
        ),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map(
          tickers.map((ticker, i) => [
            ticker,
            { monthlyDividend: (10 + i) / 100 },
          ]),
        ),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledTimes(tickers.length);
      for (let i = 0; i < tickers.length; i++) {
        expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
          tickers[i],
          10 + i,
          (10 + i) / 100,
          'yahoo',
          undefined,
          undefined,
          '2026-07-15T18:00:00Z',
          undefined,
        );
      }
    });
  });

  describe('erro nos provedores de cotação', () => {
    it('deve lançar erro quando todos os provedores falham, para acionar o retry do scheduler', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockRejectedValue(new Error('falha na brapi'));

      await expect(updateAllQuotes()).rejects.toThrow(
        'Nenhuma cotação obtida nos provedores: falha na brapi',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'updateAllQuotes.quotesFailed',
        expect.objectContaining({ message: 'falha na brapi' }),
      );
      expect(mockSaveQuoteHistory).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('não deve lançar erro quando os provedores respondem vazio sem falhar', async () => {
      const consoleWarnSpy = jest
        .spyOn(functionsLogger, 'warn')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockResolvedValue(new Map());

      await expect(updateAllQuotes()).resolves.toBeUndefined();
      expect(mockSaveQuoteHistory).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
  // A gravação leva o provedor que de fato forneceu a cotação (#598): com a
  // Brapi como reserva, o literal 'brapi' esconderia de onde veio o preço.
  describe('fonte da cotação', () => {
    it('deve gravar em source o provedor de reserva quando foi ele que respondeu', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'XPTO11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockResolvedValue(
        new Map([['XPTO11', { price: 10, source: 'brapi' }]]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'XPTO11',
        10,
        undefined,
        'brapi',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  // Horário de apuração da cotação (issue #387): repassado à gravação e
  // registrado no log, para medir no Cloud Logging quando a fonte consolida
  // o fechamento de cada pregão.
  describe('horário de apuração da cotação', () => {
    it('deve repassar o horário de apuração da fonte para a gravação', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'TRXF11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['TRXF11', { price: 73.9, quotedAt: '2026-09-23T21:31:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'TRXF11',
        73.9,
        undefined,
        'yahoo',
        undefined,
        undefined,
        '2026-09-23T21:31:00Z',
        undefined,
      );
    });

    it('deve registrar o horário de apuração no log do ticker atualizado', async () => {
      const infoSpy = jest
        .spyOn(functionsLogger, 'info')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'TRXF11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['TRXF11', { price: 73.9, quotedAt: '2026-09-23T21:31:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(infoSpy).toHaveBeenCalledWith(
        'updateAllQuotes.tickerUpdated',
        expect.objectContaining({
          ticker: 'TRXF11',
          quotedAt: '2026-09-23T21:31:00Z',
        }),
      );

      infoSpy.mockRestore();
    });
  });
});
