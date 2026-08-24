export interface QuoteResult {
  price: number;
  updatedAt: string;
}

interface BrapiResult {
  symbol: string;
  data?: {
    regularMarketPrice: number | null;
    regularMarketTime: string | null;
  };
}

interface BrapiResponse {
  results: BrapiResult[];
}

const BRAPI_BASE_URL = 'https://brapi.dev/api/v2/stocks/quote';

// O plano gratuito da Brapi permite apenas 1 ativo por requisição
// (planos pagos permitem mais — ver BRAPI_MAX_SYMBOLS_PER_REQUEST).
const DEFAULT_MAX_SYMBOLS_PER_REQUEST = 1;

function getMaxSymbolsPerRequest(): number {
  const parsed = Number(process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_SYMBOLS_PER_REQUEST;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function fetchQuoteBatch(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  const token = process.env.BRAPI_API_KEY;
  const tickerList = tickers.join(',');
  const url = `${BRAPI_BASE_URL}?symbols=${tickerList}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Brapi API returned status ${response.status}`);
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
      quoteMap.set(item.symbol, {
        price,
        updatedAt: item.data?.regularMarketTime ?? new Date().toISOString(),
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

  const batchSize = getMaxSymbolsPerRequest();
  const quoteMap = new Map<string, QuoteResult>();
  let lastError: Error | undefined;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    try {
      const batchQuotes = await fetchQuoteBatch(batch);
      for (const [symbol, quote] of batchQuotes) {
        quoteMap.set(symbol, quote);
      }
    } catch (error) {
      lastError = toError(error);
      console.error('[fetchQuotes] Erro ao buscar lote de tickers:', {
        tickers: batch,
        message: lastError.message,
      });
    }
  }

  if (lastError && quoteMap.size === 0) {
    throw lastError;
  }

  return quoteMap;
}
