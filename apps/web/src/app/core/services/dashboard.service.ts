import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { DashboardSummaryResponse } from 'dindin-shared-types';

export type { DashboardSummaryResponse };

/**
 * Resumo do dashboard (issue #300). A tela montava esses números com uma
 * requisição por carteira e uma por geladeira, além de recalcular patrimônio
 * e composição no cliente.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Observable<DashboardSummaryResponse> {
    return this.http.get<DashboardSummaryResponse>('/api/dashboard/summary');
  }
}
