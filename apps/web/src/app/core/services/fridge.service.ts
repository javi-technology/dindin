import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Fridge, FridgeItem } from 'dindin-models';

export type UpdateFridgeItemPayload = Partial<
  Pick<FridgeItem, 'targetPrice' | 'currentPrice' | 'quantity' | 'ticker'>
>;

@Injectable({
  providedIn: 'root',
})
export class FridgeService {
  private readonly http = inject(HttpClient);
  private readonly fridgesUrl = '/api/fridges';

  listFridges(): Observable<Fridge[]> {
    return this.http.get<Fridge[]>(this.fridgesUrl);
  }

  listItems(fridgeId: string): Observable<FridgeItem[]> {
    return this.http.get<FridgeItem[]>(`${this.fridgesUrl}/${fridgeId}/items`);
  }

  updateItem(
    fridgeId: string,
    itemId: string,
    payload: UpdateFridgeItemPayload,
  ): Observable<FridgeItem> {
    return this.http.put<FridgeItem>(
      `${this.fridgesUrl}/${fridgeId}/items/${itemId}`,
      payload,
    );
  }

  deleteItem(fridgeId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.fridgesUrl}/${fridgeId}/items/${itemId}`,
    );
  }
}
