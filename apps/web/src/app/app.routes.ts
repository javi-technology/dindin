import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { LoginComponent } from './features/login/login.component';
import { HomeComponent } from './features/home/home.component';
import { WalletComponent } from './features/wallet/wallet.component';
import { FridgeComponent } from './features/fridge/fridge.component';
import { DividendComponent } from './features/dividends/dividend.component';

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
    path: 'proventos',
    canActivate: [authGuard],
    component: DividendComponent,
  },
  { path: '**', redirectTo: '' },
];
