jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { fetchQuotes } from '../../src/quotes/brapi.service';

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
        quotedAt: '2026-07-15T18:00:00-03:00',
      });
    });

    // O horário de apuração é opcional (issue #387): sem ele, a cotação é
    // gravada sem o campo em vez de receber a hora da nossa consulta, que
    // seria indistinguível de um fechamento consolidado.
    it('deve retornar cotação sem horário de apuração quando a fonte não informa', async () => {
      mockFetch({
        results: [
          {
            symbol: 'HGLG11',
            data: {
              regularMarketPrice: 165.5,
              regularMarketTime: null,
            },
          },
        ],
      });

      const result = await fetchQuotes(['HGLG11']);

      expect(result.get('HGLG11')).toEqual({ price: 165.5 });
    });

    // O plano gratuito da Brapi aceita um ticker por chamada: a Brapi virou
    // reserva de cotação depois do cancelamento do plano Pro (#598).
    it('deve consultar um ticker por requisição, o limite do plano gratuito', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const symbol = new URL(url).searchParams.get('symbols') as string;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                symbol,
                data: {
                  regularMarketPrice: symbol === 'PETR4' ? 48.92 : 165.5,
                  regularMarketTime: '2026-07-15T18:00:00-03:00',
                },
              },
            ],
          }),
        });
      });
      globalThis.fetch = fetchMock;

      const result = await fetchQuotes(['HGLG11', 'MXRF11', 'PETR4']);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain(
        'brapi.dev/api/v2/stocks/quote?symbols=HGLG11',
      );
      expect(result.size).toBe(3);
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

    it('deve ignorar BRAPI_MAX_SYMBOLS_PER_REQUEST, que só valia no plano Pro', async () => {
      process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST = '20';
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;

      await fetchQuotes(['HGLG11', 'MXRF11']);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('falha de um ticker', () => {
    it('deve continuar buscando os demais tickers quando um deles falha', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
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

    it('deve lançar erro quando todos os tickers falham', async () => {
      const consoleErrorSpy = jest
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      mockFetch({}, 400);

      await expect(fetchQuotes(['HGLG11', 'MXRF11'])).rejects.toThrow(
        'Brapi API returned status 400',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('bloqueio da Brapi', () => {
    it.each([401, 403, 429])(
      'deve parar de consultar quando a Brapi responde %s (erro que afeta todas as requisições)',
      async (status) => {
        const consoleErrorSpy = jest
          .spyOn(functionsLogger, 'error')
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
        .spyOn(functionsLogger, 'error')
        .mockImplementation(() => {});
      globalThis.fetch = jest.fn().mockRejectedValue('string de erro qualquer');

      await expect(fetchQuotes(['HGLG11'])).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'fetchQuotes.batchFailed',
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
