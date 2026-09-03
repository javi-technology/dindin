import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Dividend } from 'dindin-models';

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
}

export interface MonthlyIncomeResponse {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
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

  recordMonthlyDividends(): Observable<Dividend[]> {
    return this.http.post<Dividend[]>('/api/dividends/record-monthly', {});
  }
}
