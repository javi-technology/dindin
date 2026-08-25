import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Asset } from 'dindin-models';

@Injectable({
  providedIn: 'root',
})
export class AssetService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/assets';

  /** Lista os ativos do catálogo disponíveis para seleção. */
  list(): Observable<Asset[]> {
    return this.http.get<Asset[]>(this.apiUrl);
  }
}
