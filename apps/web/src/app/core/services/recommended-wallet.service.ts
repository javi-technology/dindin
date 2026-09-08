import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AiSuggestion,
  AiSuggestionTab,
  RecommendedWallet,
  RecommendedWalletComparison,
} from 'dindin-models';

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

  getSuggestion(
    walletId: string,
    month: string,
    tab: AiSuggestionTab,
  ): Observable<AiSuggestion> {
    const params = new HttpParams()
      .set('walletId', walletId)
      .set('month', month)
      .set('tab', tab);
    return this.http.get<AiSuggestion>(`${this.apiUrl}/suggestions`, {
      params,
    });
  }

  generateSuggestion(
    walletId: string,
    month: string,
    tab: AiSuggestionTab,
    force = false,
  ): Observable<AiSuggestion> {
    let params = new HttpParams();
    if (force) {
      params = params.set('force', 'true');
    }
    return this.http.post<AiSuggestion>(
      `${this.apiUrl}/suggestions`,
      { walletId, month, tab },
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
