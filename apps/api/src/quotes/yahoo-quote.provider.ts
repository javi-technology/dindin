import { logWarn } from '../shared/logger';
import { isBlockingError, ProviderHttpError } from './provider-http-error';
import { QuoteProvider, QuoteResult } from './quote-provider';

// Endpoint público e sem chave do Yahoo Finance; os ativos da B3 levam o
// sufixo `.SA`. Não é uma API oficial: bloqueio e mudança de formato são
// tratados como falha do provedor, e a cadeia segue para a reserva (#598).
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const B3_SUFFIX = '.SA';
const PROVIDER = 'yahoo';

// Um ticker por requisição; alguns em paralelo, para o job caber no tempo
// sem disparar o limite de taxa do Yahoo.
const CONCURRENCY = 5;

// Sem um User-Agent de navegador o Yahoo recusa a requisição.
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

interface ChartResponse {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number | null;
        regularMarketTime?: number | null;
      };
    }[];
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function fetchYahooQuote(
  ticker: string,
): Promise<QuoteResult | undefined> {
  const url = `${YAHOO_CHART_URL}${encodeURIComponent(ticker + B3_SUFFIX)}?range=1d&interval=1d`;
  const response = await fetch(url, { headers: HEADERS });

  // Ticker que o Yahoo não conhece: sem cotação, não é falha do provedor.
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new ProviderHttpError(
      `Yahoo Finance respondeu com status ${response.status}`,
      response.status,
    );
  }

  const data = (await response.json()) as ChartResponse;
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  // Preço zero é ativo sem negócio, não um preço apurado.
  if (typeof price !== 'number' || !(price > 0)) return undefined;

  const time = meta?.regularMarketTime;
  return {
    price,
    ...(typeof time === 'number' &&
      time > 0 && { quotedAt: new Date(time * 1000).toISOString() }),
  };
}

/**
 * Cotações dos tickers no Yahoo Finance.
 *
 * Falha pontual de um ticker é logada e não impede os demais. Bloqueio (401,
 * 403, 429) interrompe a consulta: devolve o que já obteve, para a cadeia
 * buscar o resto na reserva, ou lança quando nada foi obtido.
 */
export async function fetchYahooQuotes(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  const quotes = new Map<string, QuoteResult>();
  let lastError: Error | undefined;

  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchYahooQuote));

    let blocked: ProviderHttpError | undefined;
    results.forEach((result, index) => {
      const ticker = batch[index];
      if (result.status === 'fulfilled') {
        if (result.value) quotes.set(ticker, result.value);
        return;
      }
      lastError = toError(result.reason);
      if (isBlockingError(result.reason)) {
        blocked = result.reason;
        return;
      }
      logWarn('quotes.provider.tickerFailed', {
        provider: PROVIDER,
        ticker,
        message: lastError.message,
      });
    });

    if (blocked) {
      if (quotes.size === 0) throw blocked;
      logWarn('quotes.provider.blocked', {
        provider: PROVIDER,
        status: blocked.status,
        remaining: tickers.length - quotes.size,
      });
      return quotes;
    }
  }

  if (lastError && quotes.size === 0) throw lastError;
  return quotes;
}

export const yahooQuoteProvider: QuoteProvider = {
  name: PROVIDER,
  fetchQuotes: fetchYahooQuotes,
};
