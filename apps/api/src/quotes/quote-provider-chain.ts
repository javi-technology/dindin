import { logError } from '../shared/logger';
import { brapiQuoteProvider } from './brapi.service';
import { ProviderHttpError } from './provider-http-error';
import { QuoteProvider, SourcedQuote } from './quote-provider';
import { yahooQuoteProvider } from './yahoo-quote.provider';

// Yahoo como fonte principal e o plano gratuito da Brapi como reserva (#598):
// a reserva tem cota mensal pequena, por isso só recebe o que faltou.
const DEFAULT_PROVIDERS: QuoteProvider[] = [
  yahooQuoteProvider,
  brapiQuoteProvider,
];

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Consulta os provedores em ordem; cada um recebe só os tickers que os
 * anteriores não cobriram. Cada cotação sai marcada com o provedor que a
 * forneceu.
 *
 * Lança o último erro apenas quando nenhum provedor devolveu cotação.
 */
export async function fetchQuotesWithFallback(
  tickers: string[],
  providers: QuoteProvider[] = DEFAULT_PROVIDERS,
): Promise<Map<string, SourcedQuote>> {
  const result = new Map<string, SourcedQuote>();
  let remaining = tickers;
  let lastError: Error | undefined;

  for (const provider of providers) {
    if (remaining.length === 0) break;
    try {
      const quotes = await provider.fetchQuotes(remaining);
      for (const ticker of remaining) {
        const quote = quotes.get(ticker);
        if (quote) result.set(ticker, { ...quote, source: provider.name });
      }
    } catch (error) {
      lastError = toError(error);
      logError('quotes.provider.failed', {
        provider: provider.name,
        status: error instanceof ProviderHttpError ? error.status : undefined,
        tickers: remaining.length,
        message: lastError.message,
      });
    }
    remaining = remaining.filter((ticker) => !result.has(ticker));
  }

  if (lastError && result.size === 0) throw lastError;
  return result;
}
