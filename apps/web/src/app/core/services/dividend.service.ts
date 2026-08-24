import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MonthlyDividendProjection {
  ticker: string;
  amountPerShare: number;
  quantity: number;
  monthlyAmount: number;
}

export interface DividendProjectionResponse {
  projections: MonthlyDividendProjection[];
  total: number;
}

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

@Injectable({
  providedIn: 'root',
})
export class DividendService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/dividends';

  getProjection(): Observable<DividendProjectionResponse> {
    return this.http.get<DividendProjectionResponse>(
      `${this.apiUrl}/projection`,
    );
  }

  getDividendYield(walletId: string): Observable<DividendYieldResponse> {
    return this.http.get<DividendYieldResponse>(
      `/api/wallets/${walletId}/dividend-yield`,
    );
  }
}
