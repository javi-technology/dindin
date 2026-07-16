export interface QuoteResult {
  price: number;
  updatedAt: string;
}

interface BrapiResult {
  symbol: string;
  regularMarketPrice: number | null;
  regularMarketTime: string | null;
}

interface BrapiResponse {
  results: BrapiResult[];
}

const BRAPI_BASE_URL = 'https://brapi.dev/api/quote';

export async function fetchQuotes(
  tickers: string[],
): Promise<Map<string, QuoteResult>> {
  if (tickers.length === 0) {
    return new Map();
  }

  const token = process.env.BRAPI_API_KEY;
  const tickerList = tickers.join(',');
  const url = `${BRAPI_BASE_URL}/${tickerList}?token=${token}`;

  const response = await fetch(url);

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
    if (
      item.regularMarketPrice !== null &&
      item.regularMarketPrice !== undefined
    ) {
      quoteMap.set(item.symbol, {
        price: item.regularMarketPrice,
        updatedAt: item.regularMarketTime ?? new Date().toISOString(),
      });
    }
  }

  return quoteMap;
}
