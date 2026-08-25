import { fetchMonthlyDividends } from '../../src/quotes/dividend-fetch.service';
import { ActiveAsset } from '../../src/assets/asset.service';
import YahooFinance from 'yahoo-finance2';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('DividendFetchService — fetchMonthlyDividends', () => {
  const originalFetch = globalThis.fetch;
  const historicalMock = jest.fn();
  const YahooFinanceMock = YahooFinance as unknown as jest.Mock;

  beforeEach(() => {
    process.env.BRAPI_API_KEY = 'test-api-key';
    historicalMock.mockReset();
    YahooFinanceMock.mockImplementation(() => ({
      historical: historicalMock,
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.BRAPI_API_KEY;
    YahooFinanceMock.mockReset();
  });

  function mockFetch(response: unknown, status = 200) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(response),
    });
  }

  describe('FIIs', () => {
    it('deve retornar o último rendimento de cada FII', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbols = new URL(url).searchParams.get('symbols') as string;
        if (symbols === 'HGLG11') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
              dividends: [
                {
                  symbol: 'HGLG11',
                  label: 'RENDIMENTO',
                  rate: 0.92,
                  paymentDate: '2026-07-14T00:00:00.000Z',
                },
                {
                  symbol: 'HGLG11',
                  label: 'RENDIMENTO',
                  rate: 0.9,
                  paymentDate: '2026-06-12T00:00:00.000Z',
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ dividends: [] }),
        });
      });
      globalThis.fetch = fetchMock;

      const assets: ActiveAsset[] = [{ ticker: 'HGLG11', assetType: 'FII' }];
      const result = await fetchMonthlyDividends(assets);

      expect(result.get('HGLG11')).toBe(0.92);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'brapi.dev/api/v2/fii/dividends?symbols=HGLG11',
        ),
        expect.any(Object),
      );
    });

    it('deve ignorar amortizações e usar apenas rendimentos', async () => {
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'AMORTIZACAO',
            rate: 1.5,
            paymentDate: '2026-07-14T00:00:00.000Z',
          },
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.88,
            paymentDate: '2026-06-12T00:00:00.000Z',
          },
        ],
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);

      expect(result.get('HGLG11')).toBe(0.88);
    });

    it('deve retornar undefined quando FII não tem histórico de dividendos', async () => {
      mockFetch({ dividends: [] });

      const result = await fetchMonthlyDividends([
        { ticker: 'NOVO11', assetType: 'FII' },
      ]);

      expect(result.has('NOVO11')).toBe(false);
    });
  });

  describe('Ações e ETFs', () => {
    it('deve retornar o último dividendo em dinheiro de cada ação', async () => {
      mockFetch({
        results: [
          {
            symbol: 'PETR4',
            data: {
              cashDividends: [
                {
                  rate: 1.25,
                  paymentDate: '2026-07-15T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
                {
                  rate: 1.1,
                  paymentDate: '2026-06-15T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
              ],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.get('PETR4')).toBe(1.25);
    });

    it('deve retornar undefined quando ação não tem dividendos em dinheiro', async () => {
      mockFetch({
        results: [
          {
            symbol: 'NOVA3',
            data: {
              cashDividends: [],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'NOVA3', assetType: 'STOCK' },
      ]);

      expect(result.has('NOVA3')).toBe(false);
    });
  });

  describe('agrupamento por tipo', () => {
    it('deve chamar endpoint de FII para FIIs e endpoint de stocks para ações', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v2/fii/dividends')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
              dividends: [
                {
                  symbol: 'HGLG11',
                  label: 'RENDIMENTO',
                  rate: 0.9,
                  paymentDate: '2026-07-14T00:00:00.000Z',
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                symbol: 'PETR4',
                data: {
                  cashDividends: [
                    {
                      rate: 1.25,
                      paymentDate: '2026-07-15T03:00:00.000Z',
                      label: 'DIVIDENDO',
                    },
                  ],
                  stockDividends: [],
                  subscriptions: [],
                },
              },
            ],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.get('HGLG11')).toBe(0.9);
      expect(result.get('PETR4')).toBe(1.25);
      const urls = fetchMock.mock.calls.map((call) => call[0] as string);
      expect(urls.some((u) => u.includes('/api/v2/fii/dividends'))).toBe(true);
      expect(urls.some((u) => u.includes('/api/v2/stocks/dividends'))).toBe(
        true,
      );
    });
  });

  describe('falha parcial', () => {
    it('deve logar erro e continuar quando um lote falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockFetch({ error: 'Unauthorized' }, 401);

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);

      expect(result.size).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('fallback Yahoo Finance', () => {
    it('deve buscar dividendos no Yahoo Finance quando a Brapi falhar', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);
      historicalMock.mockImplementation((ticker: string) => {
        if (ticker === 'PETR4.SA') {
          return Promise.resolve([
            {
              date: new Date('2026-06-15T03:00:00.000Z'),
              dividends: 1.1,
            },
            {
              date: new Date('2026-07-15T03:00:00.000Z'),
              dividends: 1.25,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.get('PETR4')).toBe(1.25);
      expect(historicalMock).toHaveBeenCalledWith(
        'PETR4.SA',
        expect.objectContaining({
          period1: expect.any(Date),
          period2: expect.any(Date),
          events: 'dividends',
        }),
      );
    });

    it('deve buscar FIIs no Yahoo Finance quando a Brapi não retornar resultado', async () => {
      mockFetch({ dividends: [] });
      historicalMock.mockImplementation((ticker: string) => {
        if (ticker === 'HGLG11.SA') {
          return Promise.resolve([
            {
              date: new Date('2026-06-12T03:00:00.000Z'),
              dividends: 0.9,
            },
            {
              date: new Date('2026-07-14T03:00:00.000Z'),
              dividends: 0.92,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);

      expect(result.get('HGLG11')).toBe(0.92);
    });

    it('deve complementar resultados parciais da Brapi com dados do Yahoo Finance', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v2/fii/dividends')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
              dividends: [
                {
                  symbol: 'HGLG11',
                  label: 'RENDIMENTO',
                  rate: 0.9,
                  paymentDate: '2026-07-14T00:00:00.000Z',
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ results: [] }),
        });
      });
      globalThis.fetch = fetchMock;
      historicalMock.mockImplementation((ticker: string) => {
        if (ticker === 'PETR4.SA') {
          return Promise.resolve([
            {
              date: new Date('2026-07-15T03:00:00.000Z'),
              dividends: 1.25,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.get('HGLG11')).toBe(0.9);
      expect(result.get('PETR4')).toBe(1.25);
    });

    it('deve ignorar ticker quando Yahoo Finance retornar lista vazia', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);
      historicalMock.mockResolvedValue([]);

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.has('PETR4')).toBe(false);
    });

    it('deve ignorar ticker quando Yahoo Finance lançar erro', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);
      historicalMock.mockRejectedValue(new Error('Timeout'));

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.has('PETR4')).toBe(false);
    });

    it('deve ignorar dividendos inválidos do Yahoo Finance', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);
      historicalMock.mockResolvedValue([
        { date: new Date('2026-07-15T03:00:00.000Z'), dividends: NaN },
      ]);

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
      ]);

      expect(result.has('PETR4')).toBe(false);
    });
  });

  describe('lista vazia', () => {
    it('deve retornar Map vazio sem chamar a API', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;

      const result = await fetchMonthlyDividends([]);

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
