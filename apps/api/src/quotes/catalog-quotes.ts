import { fetchQuotes, QuoteResult } from './brapi.service';
import { logError, logWarn } from '../shared/logger';

/**
 * Busca na Brapi as cotações dos tickers informados, a fonte oficial e única
 * do DinDin.
 *
 * Tickers sem cotação são apenas logados. Lança erro quando a Brapi falha por
 * completo, para que o scheduler acione o retry.
 *
 * Mora aqui, e não no job diário, porque a reconciliação noturna (#389) faz a
 * mesma busca com o mesmo tratamento de falha; `event` distingue os dois no
 * Cloud Logging.
 */
export async function fetchCatalogQuotes(
  tickerList: string[],
  event: string,
): Promise<Map<string, QuoteResult>> {
  let quotes: Map<string, QuoteResult>;
  try {
    quotes = await fetchQuotes(tickerList);
  } catch (error) {
    const brapiError = error as Error;
    logError(`${event}.brapiFailed`, { message: brapiError.message });
    throw new Error(`Nenhuma cotação obtida na Brapi: ${brapiError.message}`);
  }

  const withoutQuote = tickerList.filter((ticker) => !quotes.has(ticker));
  if (withoutQuote.length > 0) {
    logWarn(`${event}.tickersWithoutQuote`, { tickers: withoutQuote });
  }

  return quotes;
}
