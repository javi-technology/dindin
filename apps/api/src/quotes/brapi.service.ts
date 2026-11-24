import { fetchInBatches } from './brapi-batch';
import { ProviderHttpError } from './provider-http-error';
import { QuoteProvider, QuoteResult } from './quote-provider';

interface BrapiResult {
  symbol: string;
  // Ticker pedido; difere de `symbol` quando o ativo foi renomeado
  // (ex.: VIIA3 → BHIA3).
  requestedSymbol?: string;
  data?: {
    regularMarketPrice: number | null;
    regularMarketTime: string | null;
  };
}

interface BrapiResponse {
  results: BrapiResult[];
}

// O endpoint de cotações v2 atende ações, FIIs e ETFs na mesma chamada.
const BRAPI_BASE_URL = 'https://brapi.dev/api/v2/stocks/quote';

// A Brapi virou reserva de cotação no plano gratuito, que aceita um ticker
// por chamada (#598); acima disso ela responde 400.
const SYMBOLS_PER_REQUEST = 1;

async function fetchQuoteBatch(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  const token = process.env.BRAPI_API_KEY;
  const tickerList = tickers.join(',');
  const url = `${BRAPI_BASE_URL}?symbols=${encodeURIComponent(tickerList)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new ProviderHttpError(
      `Brapi API returned status ${response.status}`,
      response.status,
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !('results' in data) ||
    !Array.isArray((data as BrapiResponse).results)
  ) {
    throw new Error('Invalid response from Brapi API');
  }

  const { results } = data as BrapiResponse;
  const quoteMap = new Map<string, QuoteResult>();

  for (const item of results) {
    const price = item.data?.regularMarketPrice ?? null;
    if (price !== null && price !== undefined) {
      const quotedAt = item.data?.regularMarketTime ?? undefined;
      quoteMap.set((item.requestedSymbol ?? item.symbol).toUpperCase(), {
        price,
        ...(quotedAt && { quotedAt }),
      });
    }
  }

  return quoteMap;
}

export async function fetchQuotes(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  if (tickers.length === 0) {
    return new Map();
  }

  return fetchInBatches(
    tickers,
    SYMBOLS_PER_REQUEST,
    fetchQuoteBatch,
    'fetchQuotes.batchFailed',
  );
}

export const brapiQuoteProvider: QuoteProvider = {
  name: 'brapi',
  fetchQuotes,
};
