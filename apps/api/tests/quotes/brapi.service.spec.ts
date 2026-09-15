import { fetchQuotes, QuoteResult } from '../../src/quotes/brapi.service';

describe('BrapiService — fetchQuotes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Garante que BRAPI_API_KEY está definida para os testes
    process.env.BRAPI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.BRAPI_API_KEY;
    delete process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST;
  });

  function mockFetch(response: unknown, status = 200) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(response),
    });
  }

  function mockFetchReject(error: Error) {
    globalThis.fetch = jest.fn().mockRejectedValue(error);
  }

  describe('sucesso', () => {
    it('deve retornar cotação para um único ticker', async () => {
      mockFetch({
        results: [
          {
            symbol: 'HGLG11',
            data: {
              regularMarketPrice: 165.5,
              regularMarketTime: '2026-07-15T18:00:00-03:00',
            },
          },
        ],
      });

      const result = await fetchQuotes(['HGLG11']);

      expect(result.size).toBe(1);
      expect(result.get('HGLG11')).toEqual({
        price: 165.5,
        updatedAt: '2026-07-15T18:00:00-03:00',
      });
    });

    it('deve retornar cotações de ações e FIIs na mesma requisição (até 20 ativos, limite do plano Pro)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          results: [
            {
              symbol: 'HGLG11',
              data: {
                regularMarketPrice: 165.5,
                regularMarketTime: '2026-07-15T18:00:00-03:00',
              },
            },
            {
              symbol: 'MXRF11',
              data: {
                regularMarketPrice: 10.32,
                regularMarketTime: '2026-07-15T18:00:00-03:00',
              },
            },
            {
              symbol: 'PETR4',
              data: {
                regularMarketPrice: 48.92,
                regularMarketTime: '2026-07-15T18:00:00-03:00',
              },
            },
          ],
        }),
      });
      globalThis.fetch = fetchMock;

      const result = await fetchQuotes(['HGLG11', 'MXRF11', 'PETR4']);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain(
        'brapi.dev/api/v2/stocks/quote?symbols=HGLG11%2CMXRF11%2CPETR4',
      );
      expect(result.size).toBe(3);
      expect(result.get('HGLG11')?.price).toBe(165.5);
      expect(result.get('MXRF11')?.price).toBe(10.32);
      expect(result.get('PETR4')?.price).toBe(48.92);
    });

    it('deve enviar a chave via header Authorization, e não na query string', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;

      await fetchQuotes(['HGLG11']);

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain('token=');

      const options = fetchMock.mock.calls[0][1] as Record<string, unknown>;
      expect(options).toBeDefined();
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-api-key',
      );
    });

    it('deve agrupar em lotes de 20 tickers por padrão', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;
      const tickers = Array.from({ length: 45 }, (_, i) => `TICK${i}11`);

      await fetchQuotes(tickers);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const symbolsPerCall = fetchMock.mock.calls.map(
        ([url]) =>
          (new URL(url as string).searchParams.get('symbols') as string).split(
            ',',
          ).length,
      );
      expect(symbolsPerCall).toEqual([20, 20, 5]);
    });

    it('deve limitar BRAPI_MAX_SYMBOLS_PER_REQUEST a 20, o máximo aceito pela Brapi', async () => {
      process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST = '50';
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;
      const tickers = Array.from({ length: 25 }, (_, i) => `TICK${i}11`);

      await fetchQuotes(tickers);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('deve respeitar BRAPI_MAX_SYMBOLS_PER_REQUEST para agrupar tickers por requisição', async () => {
      process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST = '2';
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;

      await fetchQuotes(['HGLG11', 'MXRF11', 'KNRI11']);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain('symbols=HGLG11%2CMXRF11');
      expect(fetchMock.mock.calls[1][0]).toContain('symbols=KNRI11');
    });

    it.each(['0', '-1', 'abc', '1.5', ''])(
      'deve usar o padrão (20 tickers por requisição) quando BRAPI_MAX_SYMBOLS_PER_REQUEST for inválido (%s)',
      async (invalidValue) => {
        process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST = invalidValue;
        const fetchMock = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ results: [] }),
        });
        globalThis.fetch = fetchMock;
        const tickers = Array.from({ length: 20 }, (_, i) => `TICK${i}11`);

        await fetchQuotes(tickers);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('falha parcial entre lotes', () => {
    it('deve continuar buscando os demais lotes quando um deles falha', async () => {
      process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST = '1';
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbol = new URL(url).searchParams.get('symbols') as string;
        if (symbol === 'MXRF11') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                symbol,
                data: {
                  regularMarketPrice: 165.5,
                  regularMarketTime: '2026-07-15T18:00:00-03:00',
                },
              },
            ],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchQuotes(['HGLG11', 'MXRF11']);

      expect(result.size).toBe(1);
      expect(result.get('HGLG11')?.price).toBe(165.5);
      expect(result.has('MXRF11')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('deve lançar erro quando todos os lotes falham', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockFetch({}, 400);

      await expect(fetchQuotes(['HGLG11', 'MXRF11'])).rejects.toThrow(
        'Brapi API returned status 400',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('lote recusado pela Brapi', () => {
    function quoteFor(symbol: string, price: number) {
      return {
        symbol,
        requestedSymbol: symbol,
        data: {
          regularMarketPrice: price,
          regularMarketTime: '2026-07-15T18:00:00-03:00',
        },
      };
    }

    it('deve buscar ticker a ticker um lote que falhou, sem perder os tickers válidos', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const prices: Record<string, number> = { HGLG11: 165.5, KNRI11: 152 };
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbols = new URL(url).searchParams.get('symbols') as string;
        if (symbols.includes(',') || symbols === 'MXRF11') {
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
            results: [quoteFor(symbols, prices[symbols])],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchQuotes(['HGLG11', 'MXRF11', 'KNRI11']);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.get('HGLG11')?.price).toBe(165.5);
      expect(result.get('KNRI11')?.price).toBe(152);
      expect(result.has('MXRF11')).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[fetchQuotes] Erro ao buscar lote de tickers:',
        expect.objectContaining({ tickers: ['MXRF11'] }),
      );

      consoleErrorSpy.mockRestore();
    });

    it.each([401, 403, 429])(
      'não deve repetir ticker a ticker quando a Brapi responde %s (erro que afeta todas as requisições)',
      async (status) => {
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        mockFetch({}, status);

        await expect(fetchQuotes(['HGLG11', 'MXRF11'])).rejects.toThrow(
          `Brapi API returned status ${status}`,
        );
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        consoleErrorSpy.mockRestore();
      },
    );
  });

  describe('ticker renomeado', () => {
    it('deve indexar a cotação pelo símbolo solicitado quando a Brapi retorna o ticker novo', async () => {
      mockFetch({
        results: [
          {
            symbol: 'BHIA3',
            requestedSymbol: 'VIIA3',
            data: {
              regularMarketPrice: 7.5,
              regularMarketTime: '2026-07-15T18:00:00-03:00',
            },
          },
        ],
      });

      const result = await fetchQuotes(['VIIA3']);

      expect(result.get('VIIA3')?.price).toBe(7.5);
      expect(result.has('BHIA3')).toBe(false);
    });
  });

  describe('ticker não encontrado', () => {
    it('deve ignorar tickers sem regularMarketPrice (null)', async () => {
      mockFetch({
        results: [
          {
            symbol: 'HGLG11',
            data: {
              regularMarketPrice: 165.5,
              regularMarketTime: '2026-07-15T18:00:00-03:00',
            },
          },
          {
            symbol: 'TICKER_INEXISTENTE',
            data: null,
          },
        ],
      });

      const result = await fetchQuotes(['HGLG11', 'TICKER_INEXISTENTE']);

      expect(result.size).toBe(1);
      expect(result.has('HGLG11')).toBe(true);
      expect(result.has('TICKER_INEXISTENTE')).toBe(false);
    });

    it('deve retornar Map vazio quando Brapi não retorna resultados', async () => {
      mockFetch({ results: [] });

      const result = await fetchQuotes(['TICKER_INEXISTENTE']);

      expect(result.size).toBe(0);
    });
  });

  describe('erros', () => {
    it('deve lançar erro quando fetch rejeita (erro de rede)', async () => {
      mockFetchReject(new Error('Network error'));

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow('Network error');
    });

    it('deve lançar erro tratado quando fetch rejeita com um valor que não é Error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      globalThis.fetch = jest.fn().mockRejectedValue('string de erro qualquer');

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[fetchQuotes] Erro ao buscar lote de tickers:',
        expect.objectContaining({
          tickers: ['HGLG11'],
          message: expect.any(String),
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('deve lançar erro para resposta HTTP 4xx', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow(
        'Brapi API returned status 401',
      );
    });

    it('deve lançar erro para resposta HTTP 5xx', async () => {
      mockFetch({ error: 'Internal Server Error' }, 500);

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow(
        'Brapi API returned status 500',
      );
    });

    it('deve lançar erro quando a resposta não tem o campo results', async () => {
      mockFetch({ data: [] });

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow(
        'Invalid response from Brapi API',
      );
    });

    it('deve lançar erro quando results não é um array', async () => {
      mockFetch({ results: 'invalid' });

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow(
        'Invalid response from Brapi API',
      );
    });
  });

  describe('lista vazia de tickers', () => {
    it('deve retornar Map vazio sem chamar a API', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;

      const result = await fetchQuotes([]);

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
