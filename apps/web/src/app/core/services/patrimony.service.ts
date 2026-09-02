import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PatrimonySnapshot } from 'dindin-models';

@Injectable({
  providedIn: 'root',
})
export class PatrimonyService {
  private readonly http = inject(HttpClient);
  private readonly historyUrl = '/api/patrimony/history';
  private readonly snapshotUrl = '/api/patrimony/snapshots';

  getHistory(limit?: number): Observable<PatrimonySnapshot[]> {
    const url =
      limit === undefined
        ? this.historyUrl
        : `${this.historyUrl}?limit=${limit}`;
    return this.http.get<PatrimonySnapshot[]>(url);
  }

  recordSnapshot(): Observable<PatrimonySnapshot> {
    return this.http.post<PatrimonySnapshot>(this.snapshotUrl, {});
  }
}
