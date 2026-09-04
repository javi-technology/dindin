import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RecommendedWallet, RecommendedWalletComparison } from 'dindin-models';

@Injectable({
  providedIn: 'root',
})
export class RecommendedWalletService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/recommended-wallets/bb-fii';
  private readonly adminUrl = '/api/admin/recommended-wallets/bb-fii';

  list(): Observable<RecommendedWallet[]> {
    return this.http.get<RecommendedWallet[]>(this.apiUrl);
  }

  latest(month?: string): Observable<RecommendedWallet> {
    let params = new HttpParams();
    if (month) {
      params = params.set('month', month);
    }
    return this.http.get<RecommendedWallet>(`${this.apiUrl}/latest`, {
      params,
    });
  }

  compare(
    walletId: string,
    month?: string,
    wallet: 'renda' | 'ganho' = 'renda',
  ): Observable<RecommendedWalletComparison> {
    let params = new HttpParams().set('wallet', wallet);
    if (month) {
      params = params.set('month', month);
    }
    return this.http.get<RecommendedWalletComparison>(
      `${this.apiUrl}/compare/${walletId}`,
      { params },
    );
  }

  confirm(id: string): Observable<RecommendedWallet> {
    return this.http.put<RecommendedWallet>(
      `${this.adminUrl}/${id}/confirm`,
      {},
    );
  }

  import(
    fileName: string,
    contentBase64: string,
  ): Observable<RecommendedWallet> {
    return this.http.post<RecommendedWallet>(`${this.adminUrl}/import`, {
      fileName,
      contentBase64,
    });
  }
}
