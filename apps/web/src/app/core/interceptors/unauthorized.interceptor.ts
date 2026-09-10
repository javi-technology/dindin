import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const billingService = inject(BillingService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/login']);
      }
      if (
        error.status === 403 &&
        error.error?.code === 'SUBSCRIPTION_REQUIRED'
      ) {
        billingService.markSubscriptionRequired();
      }
      return throwError(() => error);
    }),
  );
};
