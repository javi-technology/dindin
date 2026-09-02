import { Dividend } from 'dindin-models';

export interface TickerTotal {
  ticker: string;
  total: number;
}

export interface MonthlyDividendReportMonth {
  month: string;
  total: number;
  byTicker: TickerTotal[];
}

export interface MonthlyDividendReport {
  year: number;
  months: MonthlyDividendReportMonth[];
  byTicker: TickerTotal[];
  total: number;
  availableYears: number[];
}

const PAYMENT_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function roundTotal(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeTicker(ticker: unknown): string {
  return typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
}

function dividendAmount(dividend: Dividend): number | null {
  if (
    typeof dividend.totalAmount === 'number' &&
    Number.isFinite(dividend.totalAmount)
  ) {
    return dividend.totalAmount;
  }

  if (dividend.totalAmount !== undefined && dividend.totalAmount !== null) {
    return null;
  }

  if (
    typeof dividend.amountPerShare === 'number' &&
    Number.isFinite(dividend.amountPerShare) &&
    typeof dividend.quantity === 'number' &&
    Number.isFinite(dividend.quantity)
  ) {
    const fallback = dividend.amountPerShare * dividend.quantity;
    return Number.isFinite(fallback) ? fallback : null;
  }

  return null;
}

function isValidDividend(dividend: Dividend): boolean {
  return (
    typeof dividend.paymentDate === 'string' &&
    PAYMENT_DATE_REGEX.test(dividend.paymentDate) &&
    normalizeTicker(dividend.ticker).length > 0 &&
    dividendAmount(dividend) !== null
  );
}

export function buildMonthlyDividendReport(
  dividends: Dividend[],
  year: number,
): MonthlyDividendReport {
  const availableYears = new Set<number>();
  const monthTotals = new Map<
    string,
    { total: number; byTicker: Map<string, number> }
  >();
  const yearTotals = new Map<string, number>();
  let total = 0;

  for (const dividend of dividends) {
    if (!isValidDividend(dividend)) {
      continue;
    }

    const paymentYear = Number(dividend.paymentDate.slice(0, 4));
    availableYears.add(paymentYear);

    if (dividend.paymentDate.slice(0, 4) !== String(year)) {
      continue;
    }

    const ticker = normalizeTicker(dividend.ticker);
    const amount = dividendAmount(dividend)!;
    const month = dividend.paymentDate.slice(0, 7);
    const monthData = monthTotals.get(month) ?? {
      total: 0,
      byTicker: new Map<string, number>(),
    };

    monthData.total += amount;
    monthData.byTicker.set(
      ticker,
      (monthData.byTicker.get(ticker) ?? 0) + amount,
    );
    monthTotals.set(month, monthData);
    yearTotals.set(ticker, (yearTotals.get(ticker) ?? 0) + amount);
    total += amount;
  }

  const toTickerTotals = (totals: Map<string, number>): TickerTotal[] =>
    [...totals.entries()]
      .sort(([tickerA], [tickerB]) => tickerA.localeCompare(tickerB))
      .map(([ticker, tickerTotal]) => ({
        ticker,
        total: roundTotal(tickerTotal),
      }));

  const months = [...monthTotals.entries()]
    .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
    .map(([month, monthData]) => ({
      month,
      total: roundTotal(monthData.total),
      byTicker: toTickerTotals(monthData.byTicker),
    }));

  return {
    year,
    months,
    byTicker: toTickerTotals(yearTotals),
    total: roundTotal(total),
    availableYears: [...availableYears].sort((yearA, yearB) => yearB - yearA),
  };
}
