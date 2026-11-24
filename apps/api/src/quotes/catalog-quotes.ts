import { SourcedQuote } from './quote-provider';
import { fetchQuotesWithFallback } from './quote-provider-chain';
import { logError, logWarn } from '../shared/logger';

/**
 * Busca as cotações dos tickers informados na cadeia de provedores (#598):
 * Yahoo Finance, com o plano gratuito da Brapi de reserva.
 *
 * Tickers sem cotação são apenas logados. Lança erro quando todos os
 * provedores falham, para que o scheduler acione o retry.
 *
 * Mora aqui, e não no job diário, porque a reconciliação noturna (#389) faz a
 * mesma busca com o mesmo tratamento de falha; `event` distingue os dois no
 * Cloud Logging.
 */
export async function fetchCatalogQuotes(
  tickerList: string[],
  event: string,
): Promise<Map<string, SourcedQuote>> {
  let quotes: Map<string, SourcedQuote>;
  try {
    quotes = await fetchQuotesWithFallback(tickerList);
  } catch (error) {
    const quotesError = error as Error;
    logError(`${event}.quotesFailed`, { message: quotesError.message });
    throw new Error(
      `Nenhuma cotação obtida nos provedores: ${quotesError.message}`,
    );
  }

  const withoutQuote = tickerList.filter((ticker) => !quotes.has(ticker));
  if (withoutQuote.length > 0) {
    logWarn(`${event}.tickersWithoutQuote`, { tickers: withoutQuote });
  }

  return quotes;
}
