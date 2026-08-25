import { AssetType } from 'dindin-models';
import YahooFinance from 'yahoo-finance2';
import { ActiveAsset } from '../assets/asset.service';

export interface MonthlyDividendResult {
  ticker: string;
  monthlyDividend: number;
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
  data?: StockDividendsData;
}

interface StockDividendsResponse {
  results: StockDividendsResult[];
}

const BRAPI_FII_DIVIDENDS_URL = 'https://brapi.dev/api/v2/fii/dividends';
const BRAPI_STOCKS_DIVIDENDS_URL = 'https://brapi.dev/api/v2/stocks/dividends';

// Endpoint de FIIs aceita até 20 símbolos por requisição.
const FII_BATCH_SIZE = 20;
// Endpoint de ações — usamos um limite conservador para evitar problemas
// de planos com restrições similares.
const STOCKS_BATCH_SIZE = 20;

// Yahoo Finance não possui endpoint de lote para dividendos; consultamos
// símbolo a símbolo. O limite evita chamadas excessivas em carteiras muito
// grandes caso a Brapi falhe completamente.
const YAHOO_MAX_TICKERS = 50;
const YAHOO_LOOKBACK_DAYS = 365;

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

async function fetchFiiDividendBatch(
  tickers: string[],
): Promise<MonthlyDividendResult[]> {
  const symbols = tickers.join(',');
  const url = `${BRAPI_FII_DIVIDENDS_URL}?symbols=${encodeURIComponent(symbols)}`;
  const response = await fetch(url, { headers: buildAuthHeaders() });

  if (!response.ok) {
    throw new Error(
      `Brapi FII dividends API returned status ${response.status}`,
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

  return [...byTicker.entries()].map(([ticker, event]) => ({
    ticker,
    monthlyDividend: event.rate,
  }));
}

async function fetchStocksDividendBatch(
  tickers: string[],
): Promise<MonthlyDividendResult[]> {
  const symbols = tickers.join(',');
  const url = `${BRAPI_STOCKS_DIVIDENDS_URL}?symbols=${encodeURIComponent(symbols)}`;
  const response = await fetch(url, { headers: buildAuthHeaders() });

  if (!response.ok) {
    throw new Error(
      `Brapi stocks dividends API returned status ${response.status}`,
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
  const output: MonthlyDividendResult[] = [];

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
    output.push({
      ticker: item.symbol.toUpperCase(),
      monthlyDividend: latest.rate,
    });
  }

  return output;
}

function isFii(assetType: AssetType): boolean {
  return assetType === 'FII' || assetType === 'REIT';
}

function isStockLike(assetType: AssetType): boolean {
  return assetType === 'STOCK' || assetType === 'ETF' || assetType === 'OTHER';
}

async function fetchBatches(
  tickers: string[],
  batchSize: number,
  fetchBatch: (batch: string[]) => Promise<MonthlyDividendResult[]>,
): Promise<Map<string, number>> {
  const resultMap = new Map<string, number>();
  let lastError: Error | undefined;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    try {
      const batchResults = await fetchBatch(batch);
      for (const { ticker, monthlyDividend } of batchResults) {
        resultMap.set(ticker, monthlyDividend);
      }
    } catch (error) {
      lastError = toError(error);
      console.error(
        '[fetchMonthlyDividends] Erro ao buscar lote de dividendos:',
        {
          tickers: batch,
          message: lastError.message,
        },
      );
    }
  }

  if (lastError && resultMap.size === 0) {
    throw lastError;
  }

  return resultMap;
}

interface YahooFinanceDividend {
  date: Date;
  dividends: number;
}

function buildYahooTicker(ticker: string): string {
  return `${ticker}.SA`;
}

function yahooLookbackStartDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - YAHOO_LOOKBACK_DAYS);
  return date;
}

async function fetchYahooFinanceDividends(
  tickers: string[],
): Promise<MonthlyDividendResult[]> {
  const output: MonthlyDividendResult[] = [];
  const startDate = yahooLookbackStartDate();
  const yahooFinance = new YahooFinance();

  for (const ticker of tickers.slice(0, YAHOO_MAX_TICKERS)) {
    try {
      const dividends = (await yahooFinance.historical(
        buildYahooTicker(ticker),
        {
          period1: startDate,
          period2: new Date(),
          events: 'dividends',
        },
      )) as YahooFinanceDividend[];

      if (!Array.isArray(dividends) || dividends.length === 0) {
        continue;
      }

      const sorted = [...dividends].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );
      const latest = sorted[0];

      if (
        typeof latest.dividends !== 'number' ||
        !Number.isFinite(latest.dividends)
      ) {
        continue;
      }

      output.push({
        ticker: ticker.toUpperCase(),
        monthlyDividend: latest.dividends,
      });
    } catch (error) {
      console.error(
        '[fetchYahooFinanceDividends] Erro ao buscar dividendos no Yahoo Finance:',
        {
          ticker,
          message: toError(error).message,
        },
      );
    }
  }

  return output;
}

export async function fetchMonthlyDividends(
  assets: ActiveAsset[],
): Promise<Map<string, number>> {
  const fiiTickers = assets
    .filter((a) => isFii(a.assetType))
    .map((a) => a.ticker);
  const stockTickers = assets
    .filter((a) => isStockLike(a.assetType))
    .map((a) => a.ticker);

  const [fiiMap, stocksMap] = await Promise.all([
    fetchBatches(fiiTickers, FII_BATCH_SIZE, fetchFiiDividendBatch).catch(
      (error) => {
        console.error('[fetchMonthlyDividends] Erro ao buscar FIIs:', {
          message: toError(error).message,
        });
        return new Map<string, number>();
      },
    ),
    fetchBatches(
      stockTickers,
      STOCKS_BATCH_SIZE,
      fetchStocksDividendBatch,
    ).catch((error) => {
      console.error('[fetchMonthlyDividends] Erro ao buscar stocks:', {
        message: toError(error).message,
      });
      return new Map<string, number>();
    }),
  ]);

  const merged = new Map<string, number>();
  for (const [ticker, value] of fiiMap) merged.set(ticker, value);
  for (const [ticker, value] of stocksMap) merged.set(ticker, value);

  const allTickers = new Set([...fiiTickers, ...stockTickers]);
  const missingTickers = [...allTickers].filter(
    (ticker) => !merged.has(ticker.toUpperCase()),
  );

  if (missingTickers.length > 0) {
    const yahooResults = await fetchYahooFinanceDividends(missingTickers);
    for (const { ticker, monthlyDividend } of yahooResults) {
      merged.set(ticker, monthlyDividend);
    }
  }

  return merged;
}
