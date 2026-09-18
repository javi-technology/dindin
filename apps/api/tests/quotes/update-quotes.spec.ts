const mockFetchQuotes = jest.fn();
const mockSaveQuoteHistory = jest.fn();
const mockListActiveAssetTickers = jest.fn();
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
}));

jest.mock('../../src/dividend/dividend-sync-record.service', () => ({
  recordPaidDividends: mockRecordPaidDividends,
}));

jest.mock('../../src/assets/asset.service', () => ({
  listActiveAssetTickers: mockListActiveAssetTickers,
}));

import { updateAllQuotes } from '../../src/quotes/update-quotes.handler';

describe('UpdateQuotesHandler — updateAllQuotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMonthlyDividends.mockResolvedValue(new Map());
    mockRecordPaidDividends.mockResolvedValue([]);
  });

  describe('sem ativos no catálogo', () => {
    it('não deve chamar a Brapi quando não há ativos cadastrados', async () => {
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
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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
        'brapi',
        undefined,
        undefined,
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        0.07,
        'brapi',
        undefined,
        undefined,
      );
    });

    it('deve salvar a soma dos proventos de 12 meses junto com o histórico', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
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
        'brapi',
        '2026-07-14',
        10.8,
      );
    });

    it('deve registrar os proventos pagos de cada ticker com eventos', async () => {
      const paidEvents = [{ paymentDate: '2026-07-14', rate: 0.92 }];
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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

    it('deve logar e seguir quando o registro de proventos de um ticker falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      jest.spyOn(console, 'log').mockImplementation(() => {});
      const paidEvents = [{ paymentDate: '2026-07-14', rate: 0.5 }];
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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
        '[updateAllQuotes] Erro ao registrar proventos de HGLG11:',
        { message: 'falha no registro' },
      );
      consoleErrorSpy.mockRestore();
    });

    it('deve salvar a data de pagamento do provento junto com o histórico', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(
        new Map([
          ['HGLG11', { monthlyDividend: 0.92, paymentDate: '2026-07-14' }],
          ['MXRF11', { monthlyDividend: 0.07 }],
        ]),
      );

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        0.92,
        'brapi',
        '2026-07-14',
        undefined,
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'MXRF11',
        10.32,
        0.07,
        'brapi',
        undefined,
        undefined,
      );
    });

    it('deve preservar dividendo mensal existente quando a Brapi não retorna o valor', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockResolvedValue(new Map());

      await updateAllQuotes();

      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        undefined,
        'brapi',
        undefined,
        undefined,
      );
    });

    it('deve consultar ações e FIIs do catálogo em uma única chamada à Brapi', async () => {
      const assets = [
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'PETR4', assetType: 'STOCK' },
        { ticker: 'BOVA11', assetType: 'ETF' },
      ];
      mockListActiveAssetTickers.mockResolvedValue(assets);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['PETR4', { price: 48.92, updatedAt: '2026-07-15T18:00:00Z' }],
          ['BOVA11', { price: 182.55, updatedAt: '2026-07-15T18:00:00Z' }],
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

    it('deve logar os tickers que ficaram sem cotação na Brapi', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );

      await updateAllQuotes();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[updateAllQuotes] Tickers sem cotação na Brapi:',
        { tickers: ['MXRF11'] },
      );

      consoleWarnSpy.mockRestore();
    });

    it('não deve quebrar quando um ticker do catálogo não tem cotação na Brapi', async () => {
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'TICKER_INEXISTENTE', assetType: 'OTHER' },
      ]);
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
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
        'brapi',
        undefined,
        undefined,
      );
    });

    it('deve continuar processando outros tickers quando um falha ao salvar', async () => {
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
          ['MXRF11', { price: 10.32, updatedAt: '2026-07-15T18:00:00Z' }],
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
        'brapi',
        undefined,
        undefined,
      );
    });

    it('deve logar erro e continuar quando a busca de dividendos falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue(mockAssets());
      mockFetchQuotes.mockResolvedValue(
        new Map([
          ['HGLG11', { price: 165.5, updatedAt: '2026-07-15T18:00:00Z' }],
        ]),
      );
      mockFetchMonthlyDividends.mockRejectedValue(
        new Error('Dividends API error'),
      );

      await updateAllQuotes();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[updateAllQuotes] error ao buscar dividendos:',
        expect.objectContaining({ message: 'Dividends API error' }),
      );
      expect(mockSaveQuoteHistory).toHaveBeenCalledWith(
        'HGLG11',
        165.5,
        undefined,
        'brapi',
        undefined,
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
            { price: 10 + i, updatedAt: '2026-07-15T18:00:00Z' },
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
          'brapi',
          undefined,
          undefined,
        );
      }
    });
  });

  describe('erro na Brapi', () => {
    it('deve lançar erro quando a Brapi falha totalmente, para acionar o retry do scheduler', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockListActiveAssetTickers.mockResolvedValue([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);
      mockFetchQuotes.mockRejectedValue(new Error('Brapi API error'));

      await expect(updateAllQuotes()).rejects.toThrow(
        'Nenhuma cotação obtida na Brapi: Brapi API error',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[updateAllQuotes] Erro ao buscar cotações na Brapi:',
        expect.objectContaining({ message: 'Brapi API error' }),
      );
      expect(mockSaveQuoteHistory).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('não deve lançar erro quando a Brapi retorna vazio sem falhar', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
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
});
