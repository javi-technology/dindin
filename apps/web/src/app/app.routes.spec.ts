import { routes } from './app.routes';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { AdminAssetsComponent } from './features/admin-assets/admin-assets.component';
import { AdminUsersComponent } from './features/admin-users/admin-users.component';

describe('app routes', () => {
  (
    [
      ['admin/assets', AdminAssetsComponent],
      ['admin/users', AdminUsersComponent],
    ] as const
  ).forEach(([path, component]) => {
    describe(`${path}`, () => {
      const route = routes.find((r) => r.path === path)!;

      it('deve exigir authGuard e adminGuard', () => {
        expect(route.canActivate).toEqual([authGuard, adminGuard]);
      });

      it('deve carregar o componente sob demanda', async () => {
        expect(route.component).toBeUndefined();
        expect(await route.loadComponent!()).toBe(component);
      });
    });
  });
});
