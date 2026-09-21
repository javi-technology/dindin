import { fetchMonthlyDividends } from '../../src/quotes/dividend-fetch.service';
jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { ActiveAsset } from '../../src/assets/asset.service';

describe('DividendFetchService — fetchMonthlyDividends', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.BRAPI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.BRAPI_API_KEY;
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

      expect(result.get('HGLG11')?.monthlyDividend).toBe(0.92);
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

      expect(result.get('HGLG11')?.monthlyDividend).toBe(0.88);
    });

    it('deve retornar a data de pagamento do rendimento escolhido (YYYY-MM-DD)', async () => {
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.9,
            paymentDate: '2026-06-12T00:00:00.000Z',
          },
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.92,
            paymentDate: '2026-07-14T00:00:00.000Z',
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        new Date('2026-09-18T12:00:00.000Z'),
      );

      expect(result.get('HGLG11')).toEqual({
        monthlyDividend: 0.92,
        paymentDate: '2026-07-14',
        annualDividend: 1.82,
        paidEvents: [
          { paymentDate: '2026-06-12', rate: 0.9 },
          { paymentDate: '2026-07-14', rate: 0.92 },
        ],
      });
    });

    it('não deve gerar data de pagamento quando a Brapi retornar paymentDate nulo', async () => {
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.92,
            paymentDate: null,
          },
        ],
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
      ]);

      expect(result.get('HGLG11')).toEqual({ monthlyDividend: 0.92 });
    });

    it('deve retornar undefined quando FII não tem histórico de dividendos', async () => {
      mockFetch({ dividends: [] });

      const result = await fetchMonthlyDividends([
        { ticker: 'NOVO11', assetType: 'FII' },
      ]);

      expect(result.has('NOVO11')).toBe(false);
    });
  });

  describe('Ações', () => {
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

      expect(result.get('PETR4')?.monthlyDividend).toBe(1.25);
    });

    it('deve retornar a data de pagamento do dividendo mais recente da ação', async () => {
      mockFetch({
        results: [
          {
            symbol: 'PETR4',
            data: {
              cashDividends: [
                {
                  rate: 1.1,
                  paymentDate: '2026-06-15T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
                {
                  rate: 1.25,
                  paymentDate: '2026-10-15T03:00:00.000Z',
                  label: 'JCP',
                },
              ],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'PETR4', assetType: 'STOCK' }],
        new Date('2026-09-18T12:00:00.000Z'),
      );

      expect(result.get('PETR4')).toEqual({
        monthlyDividend: 1.25,
        paymentDate: '2026-10-15',
        annualDividend: 1.1,
        paidEvents: [{ paymentDate: '2026-06-15', rate: 1.1 }],
      });
    });

    it('não deve gerar data de pagamento quando a Brapi retornar paymentDate vazio', async () => {
      mockFetch({
        results: [
          {
            symbol: 'PETR4',
            data: {
              cashDividends: [
                { rate: 1.25, paymentDate: '', label: 'DIVIDENDO' },
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

      expect(result.get('PETR4')).toEqual({ monthlyDividend: 1.25 });
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

      expect(result.get('HGLG11')?.monthlyDividend).toBe(0.9);
      expect(result.get('PETR4')?.monthlyDividend).toBe(1.25);
      const urls = fetchMock.mock.calls.map((call) => call[0] as string);
      expect(urls.some((u) => u.includes('/api/v2/fii/dividends'))).toBe(true);
      expect(urls.some((u) => u.includes('/api/v2/stocks/dividends'))).toBe(
        true,
      );
    });
  });

  describe('ETFs', () => {
    it('não deve consultar proventos de ETFs, que a Brapi não fornece e que fazem o lote de ações ser recusado', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbols = new URL(url).searchParams.get('symbols') as string;
        if (symbols.includes('BOVA11')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue({ code: 'FII_DIVIDENDS_MISUSE' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                symbol: 'PETR4',
                requestedSymbol: 'PETR4',
                data: {
                  cashDividends: [
                    {
                      rate: 1.25,
                      paymentDate: '2026-07-15T03:00:00.000Z',
                      label: 'DIVIDENDO',
                    },
                  ],
                },
              },
            ],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
        { ticker: 'BOVA11', assetType: 'ETF' },
      ]);

      expect(result.get('PETR4')?.monthlyDividend).toBe(1.25);
      expect(result.has('BOVA11')).toBe(false);
      const urls = fetchMock.mock.calls.map((call) => call[0] as string);
      expect(urls.some((u) => u.includes('BOVA11'))).toBe(false);
    });
  });

  describe('lote recusado pela Brapi', () => {
    function stockResult(symbol: string, rate: number) {
      return {
        symbol,
        requestedSymbol: symbol,
        data: {
          cashDividends: [
            {
              rate,
              paymentDate: '2026-07-15T03:00:00.000Z',
              label: 'DIVIDENDO',
            },
          ],
        },
      };
    }

    it('deve buscar ticker a ticker um lote de ações recusado, sem perder as ações válidas', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      const rates: Record<string, number> = { PETR4: 1.25, VALE3: 2.1 };
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbols = new URL(url).searchParams.get('symbols') as string;
        if (symbols.includes('XPTO11')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue({ code: 'FII_DIVIDENDS_MISUSE' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: symbols.split(',').map((t) => stockResult(t, rates[t])),
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchMonthlyDividends([
        { ticker: 'PETR4', assetType: 'STOCK' },
        { ticker: 'XPTO11', assetType: 'OTHER' },
        { ticker: 'VALE3', assetType: 'STOCK' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.get('PETR4')?.monthlyDividend).toBe(1.25);
      expect(result.get('VALE3')?.monthlyDividend).toBe(2.1);
      expect(result.has('XPTO11')).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    it('deve buscar ticker a ticker um lote de FIIs que falhou', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbols = new URL(url).searchParams.get('symbols') as string;
        if (symbols.includes(',')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: jest.fn().mockResolvedValue({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            dividends: [
              {
                symbol: symbols,
                label: 'RENDIMENTO',
                rate: 0.9,
                paymentDate: '2026-07-14T00:00:00.000Z',
              },
            ],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'MXRF11', assetType: 'FII' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.get('HGLG11')?.monthlyDividend).toBe(0.9);
      expect(result.get('MXRF11')?.monthlyDividend).toBe(0.9);
      consoleErrorSpy.mockRestore();
    });

    it('não deve repetir ticker a ticker quando a Brapi recusa a autenticação (401)', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockFetch({ error: 'Unauthorized' }, 401);

      const result = await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'MXRF11', assetType: 'FII' },
      ]);

      expect(result.size).toBe(0);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('ticker renomeado', () => {
    it('deve indexar o provento da ação pelo símbolo solicitado quando a Brapi retorna o ticker novo', async () => {
      mockFetch({
        results: [
          {
            symbol: 'BHIA3',
            requestedSymbol: 'VIIA3',
            data: {
              cashDividends: [
                {
                  rate: 0.3,
                  paymentDate: '2026-07-15T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
              ],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends([
        { ticker: 'VIIA3', assetType: 'STOCK' },
      ]);

      expect(result.get('VIIA3')?.monthlyDividend).toBe(0.3);
      expect(result.has('BHIA3')).toBe(false);
    });
  });

  describe('falha parcial', () => {
    it('deve logar erro e continuar quando um lote falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
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

  describe('Brapi como fonte única', () => {
    it('deve retornar sem provento os tickers que a Brapi não retornou', async () => {
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

      const result = await fetchMonthlyDividends(
        [
          { ticker: 'HGLG11', assetType: 'FII' },
          { ticker: 'PETR4', assetType: 'STOCK' },
        ],
        new Date('2026-09-18T12:00:00.000Z'),
      );

      expect(result.get('HGLG11')).toEqual({
        monthlyDividend: 0.9,
        paymentDate: '2026-07-14',
        annualDividend: 0.9,
        paidEvents: [{ paymentDate: '2026-07-14', rate: 0.9 }],
      });
      expect(result.has('PETR4')).toBe(false);
    });
  });

  describe('tickers sem data de pagamento', () => {
    it('deve logar os tickers com provento mas sem data de pagamento na Brapi', async () => {
      const consoleWarnSpy = jest
        .spyOn(functionsLogger, 'warn')
        .mockImplementation(() => {});
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.92,
            paymentDate: '2026-07-14T00:00:00.000Z',
          },
          {
            symbol: 'XPLG11',
            label: 'RENDIMENTO',
            rate: 0.7,
            paymentDate: null,
          },
        ],
      });

      await fetchMonthlyDividends([
        { ticker: 'HGLG11', assetType: 'FII' },
        { ticker: 'XPLG11', assetType: 'FII' },
      ]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'fetchMonthlyDividends.withoutPaymentDate',
        { tickers: ['XPLG11'] },
      );
      consoleWarnSpy.mockRestore();
    });

    it('não deve logar quando todos os proventos têm data de pagamento', async () => {
      const consoleWarnSpy = jest
        .spyOn(functionsLogger, 'warn')
        .mockImplementation(() => {});
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.92,
            paymentDate: '2026-07-14T00:00:00.000Z',
          },
        ],
      });

      await fetchMonthlyDividends([{ ticker: 'HGLG11', assetType: 'FII' }]);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
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

  describe('soma dos proventos dos últimos 12 meses', () => {
    const today = new Date('2026-09-18T12:00:00.000Z');

    it('soma os rendimentos de FII pagos nos 12 meses até hoje', async () => {
      mockFetch({
        dividends: [
          // Anunciado, mas ainda não pago: fica fora da soma.
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 1,
            paymentDate: '2026-10-14T00:00:00.000Z',
          },
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.92,
            paymentDate: '2026-09-14T00:00:00.000Z',
          },
          {
            symbol: 'HGLG11',
            label: 'AMORTIZACAO',
            rate: 1.5,
            paymentDate: '2026-08-14T00:00:00.000Z',
          },
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.9,
            paymentDate: '2026-06-12T00:00:00.000Z',
          },
          // Exatamente 12 meses atrás: já fora da janela.
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 0.8,
            paymentDate: '2025-09-18T00:00:00.000Z',
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        today,
      );

      expect(result.get('HGLG11')).toEqual({
        monthlyDividend: 1,
        paymentDate: '2026-10-14',
        annualDividend: 1.82,
        paidEvents: [
          { paymentDate: '2026-06-12', rate: 0.9 },
          { paymentDate: '2026-09-14', rate: 0.92 },
        ],
      });
    });

    it('lista e soma os dividendos e JCP de ações pagos nos 12 meses até hoje', async () => {
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
                  rate: 0.5,
                  paymentDate: '2026-07-15T03:00:00.000Z',
                  label: 'JCP',
                },
                {
                  rate: 1.1,
                  paymentDate: '2026-01-15T03:00:00.000Z',
                  label: 'JCP',
                },
                {
                  rate: 2,
                  paymentDate: '2025-08-01T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
              ],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'PETR4', assetType: 'STOCK' }],
        today,
      );

      expect(result.get('PETR4')?.annualDividend).toBe(2.85);
      // Dividendo e JCP pagos no mesmo dia são eventos distintos.
      expect(result.get('PETR4')?.paidEvents).toEqual([
        { paymentDate: '2026-01-15', rate: 1.1 },
        { paymentDate: '2026-07-15', rate: 1.25 },
        { paymentDate: '2026-07-15', rate: 0.5 },
      ]);
    });

    it('zera a soma quando nenhum provento foi pago nos últimos 12 meses', async () => {
      mockFetch({
        results: [
          {
            symbol: 'VALE3',
            data: {
              cashDividends: [
                {
                  rate: 2.1,
                  paymentDate: '2025-03-10T03:00:00.000Z',
                  label: 'DIVIDENDO',
                },
              ],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'VALE3', assetType: 'STOCK' }],
        today,
      );

      expect(result.get('VALE3')).toEqual({
        monthlyDividend: 2.1,
        paymentDate: '2025-03-10',
        annualDividend: 0,
        paidEvents: [],
      });
    });
  });

  describe('data-com (#278)', () => {
    const today = new Date('2026-09-18T12:00:00Z');

    it('deve expor a data-com dos rendimentos de FII e os anunciados', async () => {
      mockFetch({
        dividends: [
          {
            symbol: 'MXRF11',
            label: 'RENDIMENTO',
            rate: 0.1,
            lastDatePrior: '2026-09-30T00:00:00.000Z',
            exDate: null,
            paymentDate: '2026-10-15T00:00:00.000Z',
          },
          {
            symbol: 'MXRF11',
            label: 'RENDIMENTO',
            rate: 0.1,
            lastDatePrior: '2026-08-31T00:00:00.000Z',
            exDate: null,
            paymentDate: '2026-09-15T00:00:00.000Z',
          },
          {
            symbol: 'MXRF11',
            label: 'RENDIMENTO',
            rate: 0.09,
            lastDatePrior: null,
            paymentDate: '2026-08-14T00:00:00.000Z',
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'MXRF11', assetType: 'FII' }],
        today,
      );

      expect(result.get('MXRF11')?.paidEvents).toEqual([
        { paymentDate: '2026-08-14', rate: 0.09 },
        { paymentDate: '2026-09-15', rate: 0.1, comDate: '2026-08-31' },
      ]);
      expect(result.get('MXRF11')?.upcomingEvents).toEqual([
        { paymentDate: '2026-10-15', rate: 0.1, comDate: '2026-09-30' },
      ]);
      // O anunciado não entra na soma de 12 meses.
      expect(result.get('MXRF11')?.annualDividend).toBe(0.19);
    });

    it('deve expor a data-com dos proventos de ações no fuso de Brasília', async () => {
      mockFetch({
        results: [
          {
            symbol: 'ITSA4',
            data: {
              cashDividends: [
                {
                  rate: 0.0242425,
                  label: 'JCP',
                  lastDatePrior: '2026-11-30T03:00:00.000Z',
                  exDate: '2026-12-01T03:00:00.000Z',
                  paymentDate: '2027-01-04T03:00:00.000Z',
                },
                {
                  rate: 0.0242425,
                  label: 'JCP',
                  lastDatePrior: '2026-08-31T03:00:00.000Z',
                  exDate: '2026-09-01T03:00:00.000Z',
                  paymentDate: '2026-10-01T03:00:00.000Z',
                },
              ],
              stockDividends: [],
              subscriptions: [],
            },
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'ITSA4', assetType: 'STOCK' }],
        today,
      );

      expect(result.get('ITSA4')?.upcomingEvents).toEqual([
        { paymentDate: '2026-10-01', rate: 0.0242425, comDate: '2026-08-31' },
        { paymentDate: '2027-01-04', rate: 0.0242425, comDate: '2026-11-30' },
      ]);
    });

    it('não deve expor anunciados sem data-com', async () => {
      mockFetch({
        dividends: [
          {
            symbol: 'HGLG11',
            label: 'RENDIMENTO',
            rate: 1.1,
            paymentDate: '2026-10-15T00:00:00.000Z',
          },
        ],
      });

      const result = await fetchMonthlyDividends(
        [{ ticker: 'HGLG11', assetType: 'FII' }],
        today,
      );

      expect(result.get('HGLG11')).not.toHaveProperty('upcomingEvents');
    });
  });
});
