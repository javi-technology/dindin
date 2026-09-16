import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface HealthResponse {
  status: string;
  project: string;
}

@Injectable({
  providedIn: 'root',
})
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/health';

  check(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(this.apiUrl);
  }
}
