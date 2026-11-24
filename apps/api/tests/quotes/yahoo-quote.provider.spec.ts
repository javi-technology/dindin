jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { ProviderHttpError } from '../../src/quotes/provider-http-error';
import { fetchYahooQuotes } from '../../src/quotes/yahoo-quote.provider';

/** Resposta do endpoint `v8/finance/chart` para um ticker. */
function chartBody(
  price: number | null,
  regularMarketTime: number | null = 1795122240,
) {
  return {
    chart: {
      result: [
        {
          meta: {
            currency: 'BRL',
            symbol: 'HGLG11.SA',
            exchangeName: 'SAO',
            regularMarketPrice: price,
            regularMarketTime,
          },
        },
      ],
      error: null,
    },
  };
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('fetchYahooQuotes', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('sucesso', () => {
    it('deve consultar o ticker com o sufixo .SA da B3 e devolver o preço', async () => {
      const fetchMock = jest.fn().mockResolvedValue(response(chartBody(141.8)));
      globalThis.fetch = fetchMock;

      const result = await fetchYahooQuotes(['HGLG11']);

      expect(fetchMock.mock.calls[0][0]).toContain(
        'query1.finance.yahoo.com/v8/finance/chart/HGLG11.SA',
      );
      expect(result.get('HGLG11')?.price).toBe(141.8);
    });

    // O Yahoo informa o horário em segundos desde a época; a gravação usa
    // ISO-8601, como o `regularMarketTime` da Brapi (#387).
    it('deve converter o horário de apuração de epoch para ISO-8601', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(response(chartBody(141.8, 1795122240)));

      const result = await fetchYahooQuotes(['HGLG11']);

      expect(result.get('HGLG11')).toEqual({
        price: 141.8,
        quotedAt: new Date(1795122240 * 1000).toISOString(),
      });
    });

    it('deve devolver a cotação sem horário de apuração quando a fonte não informa', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(response(chartBody(141.8, null)));

      const result = await fetchYahooQuotes(['HGLG11']);

      expect(result.get('HGLG11')).toEqual({ price: 141.8 });
    });

    it('deve consultar um ticker por requisição e indexar pelo ticker pedido', async () => {
      const fetchMock = jest.fn((url: string) =>
        Promise.resolve(
          response(chartBody(url.includes('ITSA4') ? 13.17 : 163.6)),
        ),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchYahooQuotes(['ITSA4', 'BOVA11']);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.get('ITSA4')?.price).toBe(13.17);
      expect(result.get('BOVA11')?.price).toBe(163.6);
    });

    it('não deve consultar nada sem tickers', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;

      const result = await fetchYahooQuotes([]);

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('ticker sem cotação', () => {
    // A fonte devolve preço zero para ativo sem negócio; gravar zero faria
    // o patrimônio e o preço-alvo lerem um número que a fonte não apurou.
    it.each([[0], [null], [-1]])(
      'deve ignorar o ticker com preço %p',
      async (price) => {
        globalThis.fetch = jest
          .fn()
          .mockResolvedValue(response(chartBody(price as number | null)));

        const result = await fetchYahooQuotes(['HGLG11']);

        expect(result.has('HGLG11')).toBe(false);
      },
    );

    it('deve ignorar o ticker que o Yahoo não conhece (404), sem falhar', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        response(
          {
            chart: {
              result: null,
              error: { code: 'Not Found', description: 'No data found' },
            },
          },
          404,
        ),
      );

      const result = await fetchYahooQuotes(['XPTO11']);

      expect(result.size).toBe(0);
    });

    it('deve ignorar resposta fora do formato esperado', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(response({ chart: { result: [] } }));

      const result = await fetchYahooQuotes(['HGLG11']);

      expect(result.size).toBe(0);
    });
  });

  describe('falhas', () => {
    it('deve continuar os demais tickers quando um falha pontualmente', async () => {
      globalThis.fetch = jest.fn((url: string) =>
        url.includes('MXRF11')
          ? Promise.resolve(response({}, 500))
          : Promise.resolve(response(chartBody(141.8))),
      ) as unknown as typeof fetch;

      const result = await fetchYahooQuotes(['MXRF11', 'HGLG11']);

      expect(result.has('MXRF11')).toBe(false);
      expect(result.get('HGLG11')?.price).toBe(141.8);
      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'quotes.provider.tickerFailed',
        expect.objectContaining({ provider: 'yahoo', ticker: 'MXRF11' }),
      );
    });

    it('deve lançar o erro quando nenhum ticker retornou cotação', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(response({}, 500));

      await expect(fetchYahooQuotes(['HGLG11'])).rejects.toBeInstanceOf(
        ProviderHttpError,
      );
    });

    it('deve lançar erro de rede quando nenhum ticker retornou cotação', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      await expect(fetchYahooQuotes(['HGLG11'])).rejects.toThrow(
        'getaddrinfo ENOTFOUND',
      );
    });

    // Bloqueio (401, 403, 429) vale para todas as requisições: insistir
    // ticker a ticker só multiplicaria as recusas. A cadeia de provedores
    // segue para a reserva.
    it.each([401, 403, 429])(
      'deve parar de consultar e lançar o status %p quando o Yahoo bloqueia',
      async (status) => {
        const fetchMock = jest.fn().mockResolvedValue(response({}, status));
        globalThis.fetch = fetchMock;
        const tickers = Array.from({ length: 30 }, (_, i) => `TICK${i}11`);

        const error = await fetchYahooQuotes(tickers).catch(
          (e: unknown) => e as ProviderHttpError,
        );

        expect(error).toBeInstanceOf(ProviderHttpError);
        expect((error as ProviderHttpError).status).toBe(status);
        expect(fetchMock.mock.calls.length).toBeLessThan(tickers.length);
      },
    );

    it('deve devolver o que já obteve quando o bloqueio vem no meio da consulta', async () => {
      let calls = 0;
      globalThis.fetch = jest.fn(() => {
        calls += 1;
        return Promise.resolve(
          calls === 1 ? response(chartBody(141.8)) : response({}, 429),
        );
      }) as unknown as typeof fetch;
      const tickers = [
        'HGLG11',
        ...Array.from({ length: 20 }, (_, i) => `T${i}11`),
      ];

      const result = await fetchYahooQuotes(tickers);

      expect(result.size).toBe(1);
      expect(functionsLogger.warn).toHaveBeenCalledWith(
        'quotes.provider.blocked',
        expect.objectContaining({ provider: 'yahoo', status: 429 }),
      );
    });
  });
});
