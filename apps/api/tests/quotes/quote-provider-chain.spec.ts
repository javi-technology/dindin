jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import { QuoteProvider, QuoteResult } from '../../src/quotes/quote-provider';
import { fetchQuotesWithFallback } from '../../src/quotes/quote-provider-chain';
import { ProviderHttpError } from '../../src/quotes/provider-http-error';

function provider(
  name: string,
  impl: (tickers: string[]) => Promise<Map<string, QuoteResult>>,
): QuoteProvider & { fetchQuotes: jest.Mock } {
  return { name, fetchQuotes: jest.fn(impl) };
}

function quotes(entries: Record<string, number>): Map<string, QuoteResult> {
  return new Map(
    Object.entries(entries).map(([ticker, price]) => [ticker, { price }]),
  );
}

describe('fetchQuotesWithFallback', () => {
  afterEach(() => jest.clearAllMocks());

  it('deve marcar cada cotação com o provedor que a forneceu', async () => {
    const yahoo = provider('yahoo', async () => quotes({ HGLG11: 141.8 }));
    const brapi = provider('brapi', async () => quotes({ XPTO11: 10 }));

    const result = await fetchQuotesWithFallback(
      ['HGLG11', 'XPTO11'],
      [yahoo, brapi],
    );

    expect(result.get('HGLG11')).toEqual({ price: 141.8, source: 'yahoo' });
    expect(result.get('XPTO11')).toEqual({ price: 10, source: 'brapi' });
  });

  // A reserva tem cota mensal pequena (plano gratuito): só os tickers que o
  // primeiro provedor não cobriu são consultados nela.
  it('deve consultar na reserva só os tickers sem cotação no primeiro provedor', async () => {
    const yahoo = provider('yahoo', async () => quotes({ HGLG11: 141.8 }));
    const brapi = provider('brapi', async () => quotes({ XPTO11: 10 }));

    await fetchQuotesWithFallback(['HGLG11', 'XPTO11'], [yahoo, brapi]);

    expect(brapi.fetchQuotes).toHaveBeenCalledWith(['XPTO11']);
  });

  it('não deve consultar a reserva quando o primeiro provedor cobriu tudo', async () => {
    const yahoo = provider('yahoo', async () => quotes({ HGLG11: 141.8 }));
    const brapi = provider('brapi', async () => new Map());

    await fetchQuotesWithFallback(['HGLG11'], [yahoo, brapi]);

    expect(brapi.fetchQuotes).not.toHaveBeenCalled();
  });

  it('deve recorrer à reserva quando o primeiro provedor falha por completo', async () => {
    const yahoo = provider('yahoo', async () => {
      throw new ProviderHttpError(
        'Yahoo Finance respondeu com status 429',
        429,
      );
    });
    const brapi = provider('brapi', async () => quotes({ HGLG11: 141.5 }));

    const result = await fetchQuotesWithFallback(['HGLG11'], [yahoo, brapi]);

    expect(result.get('HGLG11')).toEqual({ price: 141.5, source: 'brapi' });
    expect(functionsLogger.error).toHaveBeenCalledWith(
      'quotes.provider.failed',
      expect.objectContaining({ provider: 'yahoo', status: 429, tickers: 1 }),
    );
  });

  it('deve lançar o último erro quando nenhum provedor devolveu cotação', async () => {
    const yahoo = provider('yahoo', async () => {
      throw new Error('falha no yahoo');
    });
    const brapi = provider('brapi', async () => {
      throw new Error('falha na brapi');
    });

    await expect(
      fetchQuotesWithFallback(['HGLG11'], [yahoo, brapi]),
    ).rejects.toThrow('falha na brapi');
  });

  it('deve devolver vazio sem lançar quando os provedores respondem sem cotação', async () => {
    const yahoo = provider('yahoo', async () => new Map());
    const brapi = provider('brapi', async () => new Map());

    const result = await fetchQuotesWithFallback(['HGLG11'], [yahoo, brapi]);

    expect(result.size).toBe(0);
  });

  it('deve ignorar ticker que o provedor devolve sem ter sido pedido', async () => {
    const yahoo = provider('yahoo', async () =>
      quotes({ HGLG11: 141.8, OUTRO11: 1 }),
    );

    const result = await fetchQuotesWithFallback(['HGLG11'], [yahoo]);

    expect([...result.keys()]).toEqual(['HGLG11']);
  });

  it('não deve consultar nenhum provedor sem tickers', async () => {
    const yahoo = provider('yahoo', async () => new Map());

    const result = await fetchQuotesWithFallback([], [yahoo]);

    expect(result.size).toBe(0);
    expect(yahoo.fetchQuotes).not.toHaveBeenCalled();
  });
});
