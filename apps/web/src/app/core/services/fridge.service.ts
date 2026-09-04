import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Fridge, FridgeItem, Position } from 'dindin-models';

export interface CreateFridgePayload {
  name: string;
  description?: string;
}

export type UpdateFridgePayload = Partial<CreateFridgePayload>;

export interface CreateFridgeItemPayload {
  ticker: string;
  quantity: number;
  transferredPrice: number;
  targetPrice: number;
}

export type UpdateFridgeItemPayload = Partial<CreateFridgeItemPayload>;

@Injectable({
  providedIn: 'root',
})
export class FridgeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/fridges';

  // --- Fridge CRUD ---

  listFridges(): Observable<Fridge[]> {
    return this.http.get<Fridge[]>(this.apiUrl);
  }

  createFridge(payload: CreateFridgePayload): Observable<Fridge> {
    return this.http.post<Fridge>(this.apiUrl, payload);
  }

  getFridge(id: string): Observable<Fridge> {
    return this.http.get<Fridge>(`${this.apiUrl}/${id}`);
  }

  updateFridge(id: string, payload: UpdateFridgePayload): Observable<Fridge> {
    return this.http.put<Fridge>(`${this.apiUrl}/${id}`, payload);
  }

  deleteFridge(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // --- FridgeItem CRUD ---

  private itemsUrl(fridgeId: string): string {
    return `${this.apiUrl}/${fridgeId}/items`;
  }

  listItems(fridgeId: string): Observable<FridgeItem[]> {
    return this.http.get<FridgeItem[]>(this.itemsUrl(fridgeId));
  }

  createItem(
    fridgeId: string,
    payload: CreateFridgeItemPayload,
  ): Observable<FridgeItem> {
    return this.http.post<FridgeItem>(this.itemsUrl(fridgeId), payload);
  }

  updateItem(
    fridgeId: string,
    itemId: string,
    payload: UpdateFridgeItemPayload,
  ): Observable<FridgeItem> {
    return this.http.put<FridgeItem>(
      `${this.itemsUrl(fridgeId)}/${itemId}`,
      payload,
    );
  }

  deleteItem(fridgeId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.itemsUrl(fridgeId)}/${itemId}`);
  }

  unfreezeItem(
    fridgeId: string,
    itemId: string,
    walletId: string,
  ): Observable<Position> {
    return this.http.post<Position>(
      `${this.itemsUrl(fridgeId)}/${itemId}/unfreeze`,
      { walletId },
    );
  }
}
