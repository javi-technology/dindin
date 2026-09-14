import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AdminUser } from 'dindin-shared-types';
import { AdminUserService } from './admin-user.service';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let httpMock: HttpTestingController;

  const user: AdminUser = {
    uid: 'user-1',
    email: 'ana@dindin.app',
    admin: false,
    subscription: {
      status: 'active',
      plan: 'basic',
      interval: null,
      provider: 'manual',
      stripeStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    entitlements: ['ai'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminUserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve listar usuários sem filtro', () => {
    service.list().subscribe((response) => {
      expect(response).toEqual([user]);
    });

    const req = httpMock.expectOne('/api/admin/users');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('search')).toBeFalse();
    req.flush([user]);
  });

  it('deve listar usuários filtrando por e-mail', () => {
    service.list('ana').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/admin/users' && r.params.get('search') === 'ana',
    );
    expect(req.request.method).toBe('GET');
    req.flush([user]);
  });

  it('deve conceder acesso manual', () => {
    service
      .grant('user/1', { plan: 'basic', currentPeriodEnd: null })
      .subscribe((response) => {
        expect(response).toEqual(user);
      });

    const req = httpMock.expectOne('/api/admin/users/user%2F1/subscription');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ plan: 'basic', currentPeriodEnd: null });
    req.flush(user);
  });

  it('deve revogar acesso manual', () => {
    service.revoke('user-1').subscribe();

    const req = httpMock.expectOne('/api/admin/users/user-1/subscription');
    expect(req.request.method).toBe('DELETE');
    req.flush(user);
  });
});
