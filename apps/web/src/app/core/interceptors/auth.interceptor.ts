import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from } from 'rxjs';
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
        switchMap((token) => {
          const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next(authReq);
        }),
        catchError(() => {
          return next(req);
        }),
      );
    }),
  );
};
