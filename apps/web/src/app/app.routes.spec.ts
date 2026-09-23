import { Route } from '@angular/router';
import { routes } from './app.routes';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { AdminAssetsComponent } from './features/admin-assets/admin-assets.component';
import { AdminUsersComponent } from './features/admin-users/admin-users.component';
import { BillingComponent } from './features/billing/billing.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { DividendComponent } from './features/dividend/dividend.component';
import { FridgeComponent } from './features/fridge/fridge.component';
import { LoginComponent } from './features/login/login.component';
import { RecommendedWalletComponent } from './features/recommended-wallet/recommended-wallet.component';
import { WalletComponent } from './features/wallet/wallet.component';

// ---------------------------------------------------------------------------
// Rotas da aplicação (issue #258)
//
// Só as rotas de admin carregavam sob demanda; as demais usavam `component:`
// com import estático, então toda tela entrava no bundle inicial ainda que o
// usuário abrisse uma só — e o bundle passou do budget de aviso.
//
// O teste cobre as duas metades do contrato de cada rota: o carregamento
// preguiçoso e os guards, que é o que não pode se perder na troca.
// ---------------------------------------------------------------------------

const ROTAS = [
  { path: 'login', componente: LoginComponent, guards: [loginGuard] },
  { path: '', componente: DashboardComponent, guards: [authGuard] },
  { path: 'carteira', componente: WalletComponent, guards: [authGuard] },
  { path: 'geladeira', componente: FridgeComponent, guards: [authGuard] },
  { path: 'provento', componente: DividendComponent, guards: [authGuard] },
  {
    path: 'carteira-recomendada',
    componente: RecommendedWalletComponent,
    guards: [authGuard],
  },
  { path: 'assinatura', componente: BillingComponent, guards: [authGuard] },
  {
    path: 'admin/assets',
    componente: AdminAssetsComponent,
    guards: [authGuard, adminGuard],
  },
  {
    path: 'admin/users',
    componente: AdminUsersComponent,
    guards: [authGuard, adminGuard],
  },
] as const;

describe('app routes', () => {
  const rota = (path: string): Route => {
    const encontrada = routes.find((r) => r.path === path);

    expect(encontrada).toBeDefined();
    return encontrada!;
  };

  describe.each(ROTAS)('$path', ({ path, componente, guards }) => {
    it('deve carregar o componente sob demanda', async () => {
      const route = rota(path);

      // Import estático deixaria o componente no bundle inicial mesmo com o
      // `loadComponent` presente, por isso as duas asserções.
      expect(route.component).toBeUndefined();
      expect(await route.loadComponent!()).toBe(componente);
    });

    it('deve exigir os guards da rota', () => {
      expect(rota(path).canActivate).toEqual(guards);
    });
  });

  it('deve redirecionar rota desconhecida para a raiz', () => {
    expect(rota('**').redirectTo).toBe('');
  });

  it('não deve importar componente de feature de forma estática', () => {
    for (const route of routes) {
      expect(route.component).toBeUndefined();
    }
  });
});
