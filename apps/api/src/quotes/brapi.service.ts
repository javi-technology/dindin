import { BrapiHttpError, fetchInBatches } from './brapi-batch';

export interface QuoteResult {
  price: number;
  /**
   * Horário de apuração informado pela fonte (`regularMarketTime`), em
   * ISO-8601 (issue #387).
   *
   * Opcional de propósito: quando a Brapi não informa, a cotação é gravada
   * sem o campo. Preencher com a hora da nossa consulta faria um dado em
   * cache parecer recém-apurado — exatamente a confusão que o campo existe
   * para desfazer.
   */
  quotedAt?: string;
}

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
    throw new BrapiHttpError(
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
    getMaxSymbolsPerRequest(),
    fetchQuoteBatch,
    'fetchQuotes.batchFailed',
  );
}
