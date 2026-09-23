import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { loginGuard } from './core/guards/login.guard';

// Toda rota carrega o componente sob demanda (issue #258): com `component:` e
// import estático, abrir só a carteira ainda baixava geladeira, proventos,
// carteira recomendada e assinatura junto. Os guards seguem importados aqui
// porque precisam ser avaliados antes de decidir se vale buscar a tela.
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: 'carteira',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/wallet/wallet.component').then(
        (m) => m.WalletComponent,
      ),
  },
  {
    path: 'geladeira',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/fridge/fridge.component').then(
        (m) => m.FridgeComponent,
      ),
  },
  {
    path: 'provento',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dividend/dividend.component').then(
        (m) => m.DividendComponent,
      ),
  },
  {
    path: 'carteira-recomendada',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recommended-wallet/recommended-wallet.component').then(
        (m) => m.RecommendedWalletComponent,
      ),
  },
  {
    path: 'assinatura',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/billing/billing.component').then(
        (m) => m.BillingComponent,
      ),
  },
  {
    path: 'admin/assets',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin-assets/admin-assets.component').then(
        (m) => m.AdminAssetsComponent,
      ),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin-users/admin-users.component').then(
        (m) => m.AdminUsersComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
