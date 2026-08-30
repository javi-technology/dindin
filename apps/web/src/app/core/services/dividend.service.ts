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
}

export interface MonthlyIncomeResponse {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
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
}
