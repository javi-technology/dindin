import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FIREBASE_AUTH } from '../firebase/firebase-auth';

export const loginGuard: CanActivateFn = async () => {
  const auth = inject(FIREBASE_AUTH);
  const router = inject(Router);

  await auth.authStateReady();
  return auth.currentUser ? router.parseUrl('/') : true;
};
