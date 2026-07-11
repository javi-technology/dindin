import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Position, AssetType } from 'dindin-models';

export interface CreatePositionPayload {
  ticker: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  currentPrice?: number;
}

export type UpdatePositionPayload = Partial<CreatePositionPayload>;

@Injectable({
  providedIn: 'root',
})
export class PositionService {
  private readonly http = inject(HttpClient);

  private apiUrl(walletId: string): string {
    return `/api/wallets/${walletId}/positions`;
  }

  list(walletId: string): Observable<Position[]> {
    return this.http.get<Position[]>(this.apiUrl(walletId));
  }

  create(walletId: string, payload: CreatePositionPayload): Observable<Position> {
    return this.http.post<Position>(this.apiUrl(walletId), payload);
  }

  update(
    walletId: string,
    positionId: string,
    payload: UpdatePositionPayload,
  ): Observable<Position> {
    return this.http.put<Position>(`${this.apiUrl(walletId)}/${positionId}`, payload);
  }

  delete(walletId: string, positionId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl(walletId)}/${positionId}`);
  }
}
