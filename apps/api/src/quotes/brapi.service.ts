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

// O endpoint de cotações v2 atende ações, FIIs e ETFs na mesma chamada.
const BRAPI_BASE_URL = 'https://brapi.dev/api/v2/stocks/quote';

// O plano Pro da Brapi aceita até 20 ativos por requisição; acima disso a
// API responde 400 (QUOTES_PER_REQUEST_EXCEEDED). BRAPI_MAX_SYMBOLS_PER_REQUEST
// permite reduzir o lote (ex.: plano com limite menor), nunca ultrapassar 20.
const MAX_SYMBOLS_PER_REQUEST = 20;

function getMaxSymbolsPerRequest(): number {
  const parsed = Number(process.env.BRAPI_MAX_SYMBOLS_PER_REQUEST);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_SYMBOLS_PER_REQUEST)
    : MAX_SYMBOLS_PER_REQUEST;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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
      quoteMap.set(item.symbol.toUpperCase(), {
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
