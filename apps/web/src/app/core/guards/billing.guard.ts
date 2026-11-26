import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BillingService } from '../services/billing.service';

/**
 * A página de assinatura só existe com a cobrança ligada (issue #607). Com
 * ela desligada, o acesso direto (URL, favorito, volta do portal ou do
 * checkout da Stripe) leva ao dashboard. Sem conseguir ler o `/api/me`, vale
 * a cobrança ligada, como no restante do web.
 */
export const billingGuard: CanActivateFn = async () => {
  const billingService = inject(BillingService);
  const router = inject(Router);

  if (!billingService.loaded()) {
    try {
      await firstValueFrom(billingService.loadMe());
    } catch {
      return true;
    }
  }

  return billingService.billingEnabled() ? true : router.parseUrl('/');
};
