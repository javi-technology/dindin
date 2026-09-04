import YahooFinance from 'yahoo-finance2';
import { QuoteResult } from './brapi.service';

// O endpoint de cotação do Yahoo aceita vários símbolos por chamada; o
// limite evita URLs muito longas em catálogos grandes.
const YAHOO_QUOTE_BATCH_SIZE = 50;
const YAHOO_SUFFIX = '.SA';

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketTime?: Date;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toYahooSymbol(ticker: string): string {
  return `${ticker}${YAHOO_SUFFIX}`;
}

function fromYahooSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\.SA$/, '');
}

function isYahooQuote(value: unknown): value is YahooQuote {
  return (
    typeof value === 'object' &&
    value !== null &&
    'symbol' in value &&
    typeof (value as { symbol: unknown }).symbol === 'string'
  );
}

async function fetchYahooQuoteBatch(
  yahooFinance: InstanceType<typeof YahooFinance>,
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  const quoteMap = new Map<string, QuoteResult>();
  const results: unknown = await yahooFinance.quote(tickers.map(toYahooSymbol));

  const list = Array.isArray(results) ? results : [results];
  for (const item of list) {
    if (!isYahooQuote(item)) continue;
    const price = item.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price)) continue;

    quoteMap.set(fromYahooSymbol(item.symbol), {
      price,
      updatedAt:
        item.regularMarketTime instanceof Date
          ? item.regularMarketTime.toISOString()
          : new Date().toISOString(),
    });
  }

  return quoteMap;
}

/**
 * Busca cotações no Yahoo Finance (símbolos B3 com sufixo `.SA`).
 * Usado como fallback quando a Brapi não retorna a cotação de um ticker.
 * Nunca lança: falhas são logadas e os tickers ficam de fora do resultado.
 */
export async function fetchYahooQuotes(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  const quoteMap = new Map<string, QuoteResult>();
  if (tickers.length === 0) return quoteMap;

  const yahooFinance = new YahooFinance();

  for (let i = 0; i < tickers.length; i += YAHOO_QUOTE_BATCH_SIZE) {
    const batch = tickers.slice(i, i + YAHOO_QUOTE_BATCH_SIZE);
    try {
      const batchQuotes = await fetchYahooQuoteBatch(yahooFinance, batch);
      for (const [ticker, quote] of batchQuotes) {
        quoteMap.set(ticker, quote);
      }
    } catch (error) {
      console.error(
        '[fetchYahooQuotes] Erro ao buscar cotações no Yahoo Finance:',
        { tickers: batch, message: toError(error).message },
      );
    }
  }

  return quoteMap;
}
