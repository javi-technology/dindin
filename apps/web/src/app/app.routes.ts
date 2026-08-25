import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { loginGuard } from './core/guards/login.guard';
import { LoginComponent } from './features/login/login.component';
import { HomeComponent } from './features/home/home.component';
import { WalletComponent } from './features/wallet/wallet.component';
import { FridgeComponent } from './features/fridge/fridge.component';
import { DividendComponent } from './features/dividend/dividend.component';
import { AdminAssetsComponent } from './features/admin-assets/admin-assets.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    component: LoginComponent,
  },
  {
    path: '',
    canActivate: [authGuard],
    component: HomeComponent,
  },
  {
    path: 'carteira',
    canActivate: [authGuard],
    component: WalletComponent,
  },
  {
    path: 'geladeira',
    canActivate: [authGuard],
    component: FridgeComponent,
  },
  {
    path: 'provento',
    canActivate: [authGuard],
    component: DividendComponent,
  },
  {
    path: 'admin/assets',
    canActivate: [authGuard, adminGuard],
    component: AdminAssetsComponent,
  },
  { path: '**', redirectTo: '' },
];
