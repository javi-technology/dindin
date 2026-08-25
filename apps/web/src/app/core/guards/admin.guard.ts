import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const authService = inject(AuthService);
  const router = inject(Router);

  await auth.authStateReady();

  if (!auth.currentUser) {
    return router.parseUrl('/login');
  }

  const isAdmin = await authService.isAdmin();
  return isAdmin ? true : router.parseUrl('/');
};
