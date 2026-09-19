import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TickerDividendYield {
  ticker: string;
  annualIncome: number;
  currentValue: number;
  yield: number;
}

export interface DividendYieldResponse {
  byTicker: TickerDividendYield[];
  total: {
    annualIncome: number;
    currentValue: number;
    yield: number;
  };
}

export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  monthlyIncome: number;
  paymentDate?: string; // YYYY-MM-DD
}

/** Totais da agenda calculados na API sobre todos os ativos da carteira. */
export interface ScheduleTotals {
  upcomingTotal: number;
  paidTotal: number;
}

export interface MonthlyIncomeResponse {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  /** Recorte gratuito aplicado pela API (#262). */
  limited?: boolean;
  /** Ativos das datas de pagamento liberadas; ausente quando não há recorte. */
  scheduleItems?: MonthlyIncomeItem[];
  scheduleTotals?: ScheduleTotals;
  /** Tickers omitidos em `byTicker` pelo recorte gratuito. */
  hiddenTickers?: string[];
  /** Datas de pagamento omitidas na agenda pelo recorte gratuito. */
  hiddenPaymentDates?: string[];
  /** Tickers sem data anunciada omitidos da agenda pelo recorte gratuito. */
  hiddenScheduleTickers?: string[];
}

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

export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
}

export interface DividendHistoryResponse {
  ticker: string;
  history: DividendHistoryEntry[];
}

export interface DividendHistoryBatchResponse {
  byTicker: Record<string, DividendHistoryEntry[]>;
}

@Injectable({
  providedIn: 'root',
})
export class DividendService {
  private readonly http = inject(HttpClient);

  getDividendYield(walletId: string): Observable<DividendYieldResponse> {
    return this.http.get<DividendYieldResponse>(
      `/api/wallets/${walletId}/dividend-yield`,
    );
  }

  getMonthlyIncome(walletId: string): Observable<MonthlyIncomeResponse> {
    return this.http.get<MonthlyIncomeResponse>(
      `/api/wallets/${walletId}/monthly-income`,
    );
  }

  getMonthlyReport(year?: number): Observable<MonthlyDividendReport> {
    const url = '/api/dividends/monthly-report';
    return year === undefined
      ? this.http.get<MonthlyDividendReport>(url)
      : this.http.get<MonthlyDividendReport>(url, { params: { year } });
  }

  getDividendHistory(
    ticker: string,
    months = 12,
  ): Observable<DividendHistoryResponse> {
    return this.http.get<DividendHistoryResponse>(
      `/api/quotes/${encodeURIComponent(ticker)}/dividend-history`,
      { params: { months } },
    );
  }

  /**
   * Histórico de vários tickers numa requisição — a tela de Proventos monta
   * um sparkline por ativo, e uma chamada por ticker esbarraria no rate limit.
   */
  getDividendHistoryBatch(
    tickers: string[],
    months = 12,
  ): Observable<DividendHistoryBatchResponse> {
    return this.http.get<DividendHistoryBatchResponse>(
      '/api/quotes/dividend-history',
      { params: { tickers: tickers.join(','), months } },
    );
  }
}
