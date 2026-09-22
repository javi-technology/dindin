import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Position, FridgeItem } from 'dindin-models';
import type {
  CreatePositionRequest,
  MoveToFridgeRequest,
  UpdatePositionRequest,
} from 'dindin-shared-types';

// Contratos compartilhados com a API (issue #313). Os nomes locais seguem
// para não mexer nas features que já os importam daqui.
export type CreatePositionPayload = CreatePositionRequest;
export type UpdatePositionPayload = UpdatePositionRequest;
export type MoveToFridgePayload = MoveToFridgeRequest;

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

  create(
    walletId: string,
    payload: CreatePositionPayload,
  ): Observable<Position> {
    return this.http.post<Position>(this.apiUrl(walletId), payload);
  }

  update(
    walletId: string,
    positionId: string,
    payload: UpdatePositionPayload,
  ): Observable<Position> {
    return this.http.put<Position>(
      `${this.apiUrl(walletId)}/${positionId}`,
      payload,
    );
  }

  delete(walletId: string, positionId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl(walletId)}/${positionId}`);
  }

  moveToFridge(
    walletId: string,
    positionId: string,
    payload: MoveToFridgePayload,
  ): Observable<FridgeItem> {
    return this.http.post<FridgeItem>(
      `${this.apiUrl(walletId)}/${positionId}/move-to-fridge`,
      payload,
    );
  }
}
