import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return of(router.parseUrl('/login'));
      }
      return authService
        .isAdmin()
        .then((isAdmin) => (isAdmin ? true : router.parseUrl('/')));
    }),
  );
};
