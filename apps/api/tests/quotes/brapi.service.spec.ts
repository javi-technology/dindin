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

    it('deve retornar cotações para múltiplos tickers', async () => {
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
            symbol: 'MXRF11',
            data: {
              regularMarketPrice: 10.32,
              regularMarketTime: '2026-07-15T18:00:00-03:00',
            },
          },
          {
            symbol: 'KNRI11',
            data: {
              regularMarketPrice: 152.0,
              regularMarketTime: '2026-07-15T18:00:00-03:00',
            },
          },
        ],
      });

      const result = await fetchQuotes(['HGLG11', 'MXRF11', 'KNRI11']);

      expect(result.size).toBe(3);
      expect(result.get('HGLG11')?.price).toBe(165.5);
      expect(result.get('MXRF11')?.price).toBe(10.32);
      expect(result.get('KNRI11')?.price).toBe(152.0);
    });

    it('deve chamar a URL correta com os tickers e Authorization header', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });
      globalThis.fetch = fetchMock;

      await fetchQuotes(['HGLG11', 'MXRF11']);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(
        'brapi.dev/api/v2/stocks/quote?symbols=HGLG11,MXRF11',
      );
      expect(url).not.toContain('token=');

      const options = fetchMock.mock.calls[0][1] as Record<string, unknown>;
      expect(options).toBeDefined();
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-api-key',
      );
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
