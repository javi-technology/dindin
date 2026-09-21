import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  DividendHistoryBatchResponse,
  DividendHistoryEntry,
  DividendHistoryResponse,
  DividendYieldResponse,
  MonthlyDividendReport,
  MonthlyDividendReportMonth,
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
  ScheduleTotals,
  TickerDividendYield,
  TickerTotal,
} from 'dindin-shared-types';

// Os contratos vivem em `dindin-shared-types`, com a API (issue #313). O
// reexport mantém os imports das features apontando para o serviço.
export type {
  DividendHistoryBatchResponse,
  DividendHistoryEntry,
  DividendHistoryResponse,
  DividendYieldResponse,
  MonthlyDividendReport,
  MonthlyDividendReportMonth,
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
  ScheduleTotals,
  TickerDividendYield,
  TickerTotal,
};

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

  /**
   * Renda mensal de todas as carteiras, já com a geladeira contada uma vez e
   * o recorte gratuito aplicado pela API (issue #300).
   */
  getConsolidatedMonthlyIncome(): Observable<MonthlyIncomeResponse> {
    return this.http.get<MonthlyIncomeResponse>('/api/monthly-income');
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
