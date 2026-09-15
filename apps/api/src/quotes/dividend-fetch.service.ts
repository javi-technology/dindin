import { AssetType } from 'dindin-models';
import { ActiveAsset } from '../assets/asset.service';
import { BrapiHttpError, fetchInBatches } from './brapi-batch';

export interface DividendInfo {
  monthlyDividend: number;
  paymentDate?: string; // YYYY-MM-DD
}

interface FiiDividendEvent {
  symbol: string;
  label: string;
  rate: number;
  paymentDate: string;
}

interface FiiDividendsResponse {
  dividends: FiiDividendEvent[];
}

interface StockCashDividend {
  rate: number;
  paymentDate: string;
  label?: string;
}

interface StockDividendsData {
  cashDividends: StockCashDividend[];
  stockDividends: unknown[];
  subscriptions: unknown[];
}

interface StockDividendsResult {
  symbol: string;
  // Ticker pedido; difere de `symbol` quando o ativo foi renomeado.
  requestedSymbol?: string;
  data?: StockDividendsData;
}

interface StockDividendsResponse {
  results: StockDividendsResult[];
}

const BRAPI_FII_DIVIDENDS_URL = 'https://brapi.dev/api/v2/fii/dividends';
const BRAPI_STOCKS_DIVIDENDS_URL = 'https://brapi.dev/api/v2/stocks/dividends';

// Os endpoints de proventos de FIIs e de ações aceitam até 20 símbolos por
// requisição (limite do plano Pro); acima disso a Brapi responde 400.
const FII_BATCH_SIZE = 20;
const STOCKS_BATCH_SIZE = 20;
const BATCH_ERROR_LOG_MESSAGE =
  '[fetchMonthlyDividends] Erro ao buscar lote de dividendos:';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = process.env.BRAPI_API_KEY;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function latestEventDate(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

// As datas vêm de APIs externas: `null`, strings vazias ou valores inválidos
// não podem virar uma data (ex.: `new Date(null)` é 1970-01-01).
function toDateOnly(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

function dividendInfo(
  monthlyDividend: number,
  paymentDate: unknown,
): DividendInfo {
  const date = toDateOnly(paymentDate);
  return date ? { monthlyDividend, paymentDate: date } : { monthlyDividend };
}

async function fetchFiiDividendBatch(
  tickers: string[],
): Promise<Map<string, DividendInfo>> {
  const symbols = tickers.join(',');
  const url = `${BRAPI_FII_DIVIDENDS_URL}?symbols=${encodeURIComponent(symbols)}`;
  const response = await fetch(url, { headers: buildAuthHeaders() });

  if (!response.ok) {
    throw new BrapiHttpError(
      `Brapi FII dividends API returned status ${response.status}`,
      response.status,
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !('dividends' in data) ||
    !Array.isArray((data as FiiDividendsResponse).dividends)
  ) {
    throw new Error('Invalid response from Brapi FII dividends API');
  }

  const events = (data as FiiDividendsResponse).dividends;
  const byTicker = new Map<string, FiiDividendEvent>();

  for (const event of events) {
    if (event.label !== 'RENDIMENTO') continue;
    if (typeof event.rate !== 'number' || !Number.isFinite(event.rate))
      continue;

    const symbol = event.symbol.toUpperCase();
    const current = byTicker.get(symbol);
    if (
      !current ||
      latestEventDate(current.paymentDate, event.paymentDate) > 0
    ) {
      byTicker.set(symbol, event);
    }
  }

  return new Map(
    [...byTicker.entries()].map(([ticker, event]) => [
      ticker,
      dividendInfo(event.rate, event.paymentDate),
    ]),
  );
}

async function fetchStocksDividendBatch(
  tickers: string[],
): Promise<Map<string, DividendInfo>> {
  const symbols = tickers.join(',');
  const url = `${BRAPI_STOCKS_DIVIDENDS_URL}?symbols=${encodeURIComponent(symbols)}`;
  const response = await fetch(url, { headers: buildAuthHeaders() });

  if (!response.ok) {
    throw new BrapiHttpError(
      `Brapi stocks dividends API returned status ${response.status}`,
      response.status,
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !('results' in data) ||
    !Array.isArray((data as StockDividendsResponse).results)
  ) {
    throw new Error('Invalid response from Brapi stocks dividends API');
  }

  const results = (data as StockDividendsResponse).results;
  const output = new Map<string, DividendInfo>();

  for (const item of results) {
    const dividends = item.data?.cashDividends ?? [];
    if (!Array.isArray(dividends) || dividends.length === 0) continue;

    const sorted = [...dividends].sort((a, b) =>
      latestEventDate(a.paymentDate, b.paymentDate),
    );
    const latest = sorted[0];
    if (typeof latest.rate !== 'number' || !Number.isFinite(latest.rate)) {
      continue;
    }
    output.set(
      (item.requestedSymbol ?? item.symbol).toUpperCase(),
      dividendInfo(latest.rate, latest.paymentDate),
    );
  }

  return output;
}

function isFii(assetType: AssetType): boolean {
  return assetType === 'FII' || assetType === 'REIT';
}

// ETFs ficam de fora: a Brapi não tem proventos de ETFs (o endpoint de FIIs
// retorna vazio) e o endpoint de ações recusa o lote inteiro com 400
// (FII_DIVIDENDS_MISUSE) quando recebe um ticker como BOVA11.
function isStockLike(assetType: AssetType): boolean {
  return assetType === 'STOCK' || assetType === 'OTHER';
}

export async function fetchMonthlyDividends(
  assets: ActiveAsset[],
): Promise<Map<string, DividendInfo>> {
  const fiiTickers = assets
    .filter((a) => isFii(a.assetType))
    .map((a) => a.ticker);
  const stockTickers = assets
    .filter((a) => isStockLike(a.assetType))
    .map((a) => a.ticker);

  const [fiiMap, stocksMap] = await Promise.all([
    fetchInBatches(
      fiiTickers,
      FII_BATCH_SIZE,
      fetchFiiDividendBatch,
      BATCH_ERROR_LOG_MESSAGE,
    ).catch((error) => {
      console.error('[fetchMonthlyDividends] Erro ao buscar FIIs:', {
        message: toError(error).message,
      });
      return new Map<string, DividendInfo>();
    }),
    fetchInBatches(
      stockTickers,
      STOCKS_BATCH_SIZE,
      fetchStocksDividendBatch,
      BATCH_ERROR_LOG_MESSAGE,
    ).catch((error) => {
      console.error('[fetchMonthlyDividends] Erro ao buscar stocks:', {
        message: toError(error).message,
      });
      return new Map<string, DividendInfo>();
    }),
  ]);

  // A Brapi é a fonte oficial e única de proventos (issue #212): tickers sem
  // retorno ficam sem provento, sem consulta a outras fontes.
  const merged = new Map<string, DividendInfo>();
  for (const [ticker, value] of fiiMap) merged.set(ticker, value);
  for (const [ticker, value] of stocksMap) merged.set(ticker, value);

  const withoutPaymentDate = [...merged.entries()]
    .filter(([, info]) => !info.paymentDate)
    .map(([ticker]) => ticker);
  if (withoutPaymentDate.length > 0) {
    console.warn(
      '[fetchMonthlyDividends] Tickers com provento sem data de pagamento na Brapi:',
      { tickers: withoutPaymentDate },
    );
  }

  return merged;
}
