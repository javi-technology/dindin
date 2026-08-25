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
  private readonly adminUrl = '/api/admin/assets';

  /** Lista os ativos do catálogo disponíveis para seleção. */
  list(): Observable<Asset[]> {
    return this.http.get<Asset[]>(this.apiUrl);
  }

  /**
   * Cria um novo ativo no catálogo. Requer usuário autenticado com
   * permissão de admin.
   */
  create(asset: Omit<Asset, 'createdAt' | 'updatedAt'>): Observable<Asset> {
    return this.http.post<Asset>(this.adminUrl, asset);
  }
}
