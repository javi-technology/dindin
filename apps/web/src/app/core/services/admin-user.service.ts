import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUser, GrantSubscriptionRequest } from 'dindin-shared-types';

/** Gestão administrativa de usuários e concessões manuais de acesso IA. */
@Injectable({
  providedIn: 'root',
})
export class AdminUserService {
  private readonly http = inject(HttpClient);
  private readonly adminUrl = '/api/admin/users';

  list(search = ''): Observable<AdminUser[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<AdminUser[]>(this.adminUrl, { params });
  }

  grant(uid: string, payload: GrantSubscriptionRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(this.subscriptionUrl(uid), payload);
  }

  revoke(uid: string): Observable<AdminUser> {
    return this.http.delete<AdminUser>(this.subscriptionUrl(uid));
  }

  private subscriptionUrl(uid: string): string {
    return `${this.adminUrl}/${encodeURIComponent(uid)}/subscription`;
  }
}
