import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Wallet } from 'dindin-models';
import type { CreateWalletRequest } from 'dindin-shared-types';

/** Contrato compartilhado com a API (issue #313). */
export type CreateWalletPayload = CreateWalletRequest;

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/wallets';

  list(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>(this.apiUrl);
  }

  create(payload: CreateWalletPayload): Observable<Wallet> {
    return this.http.post<Wallet>(this.apiUrl, payload);
  }
}
