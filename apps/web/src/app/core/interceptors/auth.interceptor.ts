import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return authService.user$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return next(req);
      }

      return from(user.getIdToken()).pipe(
        catchError(() => {
          // Se não conseguir obter o token, emite erro 401 para que o
          // unauthorizedInterceptor faça o logout (sessão inválida).
          return throwError(
            () =>
              new HttpErrorResponse({
                status: 401,
                statusText: 'Unauthorized',
                error: { error: 'Unable to obtain authentication token' },
              }),
          );
        }),
        switchMap((token) => {
          const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next(authReq);
        }),
      );
    }),
  );
};
