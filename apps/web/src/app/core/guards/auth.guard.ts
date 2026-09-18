import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { SetupService } from '../services/setup.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const setupService = inject(SetupService);

  await auth.authStateReady();
  if (!auth.currentUser) return router.parseUrl('/login');

  // Garante carteira e geladeira antes da primeira tela que depende delas.
  await setupService.ensureDefaults(auth.currentUser.uid);
  return true;
};
