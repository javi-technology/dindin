import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminUser, AdminSubscriptionView } from 'dindin-shared-types';
import { AdminUsersComponent } from './admin-users.component';
import { AdminUserService } from '../../core/services/admin-user.service';

function makeUser(
  uid: string,
  subscription: Partial<AdminSubscriptionView> = {},
  extra: Partial<AdminUser> = {},
): AdminUser {
  return {
    uid,
    email: `${uid}@dindin.app`,
    admin: false,
    subscription: {
      status: 'none',
      plan: null,
      interval: null,
      provider: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      ...subscription,
    },
    entitlements: [],
    ...extra,
  };
}

describe('AdminUsersComponent', () => {
  let fixture: ComponentFixture<AdminUsersComponent>;
  let component: AdminUsersComponent;
  let serviceMock: jasmine.SpyObj<AdminUserService>;

  const noSubscription = makeUser('ana');
  const manual = makeUser(
    'bruno',
    {
      status: 'active',
      plan: 'basic',
      provider: 'manual',
      currentPeriodEnd: '2099-12-31T12:00:00.000Z',
    },
    { entitlements: ['ai'] },
  );
  const stripe = makeUser(
    'carla',
    { status: 'active', plan: 'basic', interval: 'month', provider: 'stripe' },
    { entitlements: ['ai'] },
  );

  function query(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function queryAll(testId: string): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  beforeEach(async () => {
    serviceMock = jasmine.createSpyObj('AdminUserService', [
      'list',
      'grant',
      'revoke',
    ]);
    serviceMock.list.and.returnValue(of([noSubscription, manual, stripe]));
    serviceMock.grant.and.returnValue(of(manual));
    serviceMock.revoke.and.returnValue(of(manual));

    await TestBed.configureTestingModule({
      imports: [AdminUsersComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUserService, useValue: serviceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('tabela', () => {
    it('deve carregar usuários ao inicializar', () => {
      expect(serviceMock.list).toHaveBeenCalledWith('');
      expect(component.users()).toEqual([noSubscription, manual, stripe]);
      expect(queryAll('user-row').length).toBe(3);
    });

    it('deve exibir e-mail, status, plano, provedor e validade', () => {
      const rows = queryAll('user-row');

      expect(rows[0].textContent).toContain('ana@dindin.app');
      expect(rows[0].textContent).toContain('Sem assinatura');

      expect(rows[1].textContent).toContain('bruno@dindin.app');
      expect(rows[1].textContent).toContain('Ativa');
      expect(rows[1].textContent).toContain('Básico');
      expect(rows[1].textContent).toContain('Manual');
      expect(rows[1].textContent).toContain('31/12/2099');

      expect(rows[2].textContent).toContain('Stripe');
    });

    it('deve indicar concessão manual sem validade', () => {
      serviceMock.list.and.returnValue(
        of([
          makeUser(
            'dani',
            { status: 'active', plan: 'basic', provider: 'manual' },
            { entitlements: ['ai'] },
          ),
        ]),
      );
      component.search();
      fixture.detectChanges();

      expect(queryAll('user-row')[0].textContent).toContain('Sem validade');
    });

    it('deve indicar concessão manual expirada', () => {
      serviceMock.list.and.returnValue(
        of([
          makeUser('dani', {
            status: 'active',
            plan: 'basic',
            provider: 'manual',
            currentPeriodEnd: '2020-01-01T00:00:00.000Z',
          }),
        ]),
      );
      component.search();
      fixture.detectChanges();

      expect(queryAll('user-row')[0].textContent).toContain('Expirada');
    });

    it('deve exibir estado vazio', () => {
      serviceMock.list.and.returnValue(of([]));
      component.search();
      fixture.detectChanges();

      expect(query('empty-state')).toBeTruthy();
    });

    it('deve exibir erro ao falhar o carregamento', () => {
      serviceMock.list.and.returnValue(throwError(() => ({ status: 500 })));
      component.search();
      fixture.detectChanges();

      expect(query('error-message')?.textContent).toContain(
        'Erro ao carregar usuários.',
      );
    });

    it('deve exibir Revogar apenas para concessões manuais ativas', () => {
      const rows = queryAll('user-row');

      expect(rows[0].querySelector('[data-testid="revoke-button"]')).toBeNull();
      expect(
        rows[1].querySelector('[data-testid="revoke-button"]'),
      ).toBeTruthy();
      expect(rows[2].querySelector('[data-testid="revoke-button"]')).toBeNull();
    });

    it('deve ocultar Conceder acesso para assinatura Stripe vigente', () => {
      const rows = queryAll('user-row');

      expect(
        rows[0].querySelector('[data-testid="grant-button"]'),
      ).toBeTruthy();
      expect(
        rows[1].querySelector('[data-testid="grant-button"]'),
      ).toBeTruthy();
      expect(rows[2].querySelector('[data-testid="grant-button"]')).toBeNull();
    });

    it('deve permitir Conceder acesso para assinatura Stripe cancelada', () => {
      serviceMock.list.and.returnValue(
        of([makeUser('dani', { status: 'canceled', provider: 'stripe' })]),
      );
      component.search();
      fixture.detectChanges();

      expect(
        queryAll('user-row')[0].querySelector('[data-testid="grant-button"]'),
      ).toBeTruthy();
    });

    it('deve avisar quando a busca atinge o limite de resultados', () => {
      serviceMock.list.and.returnValue(
        of(Array.from({ length: 100 }, (_, i) => makeUser(`u-${i}`))),
      );
      component.search();
      fixture.detectChanges();

      expect(query('limit-notice')?.textContent).toContain(
        'Mostrando os primeiros 100 usuários',
      );
    });

    it('não deve exibir aviso de limite abaixo de 100 resultados', () => {
      expect(query('limit-notice')).toBeNull();
    });
  });

  describe('busca', () => {
    it('deve buscar pelo e-mail informado', () => {
      component.searchControl.setValue('  bruno ');
      component.search();

      expect(serviceMock.list).toHaveBeenCalledWith('bruno');
    });
  });

  describe('modal de concessão', () => {
    it('deve abrir o modal para o usuário selecionado', () => {
      component.openGrant(noSubscription);
      fixture.detectChanges();

      expect(component.grantTarget()).toEqual(noSubscription);
      expect(query('grant-modal')?.textContent).toContain('ana@dindin.app');
    });

    it('deve conceder acesso sem validade', () => {
      component.openGrant(noSubscription);
      component.confirmGrant();

      expect(serviceMock.grant).toHaveBeenCalledWith('ana', {
        plan: 'basic',
        currentPeriodEnd: null,
      });
      expect(component.grantTarget()).toBeNull();
      expect(component.successMessage()).toBe(
        'Acesso concedido a ana@dindin.app.',
      );
      expect(serviceMock.list).toHaveBeenCalledTimes(2);
    });

    it('deve enviar a validade como fim do dia informado', () => {
      component.openGrant(noSubscription);
      component.grantForm.setValue({ currentPeriodEnd: '2099-12-31' });
      component.confirmGrant();

      expect(serviceMock.grant).toHaveBeenCalledWith('ana', {
        plan: 'basic',
        currentPeriodEnd: new Date(2099, 11, 31, 23, 59, 59).toISOString(),
      });
    });

    it('deve limpar a validade ao reabrir o modal', () => {
      component.openGrant(noSubscription);
      component.grantForm.setValue({ currentPeriodEnd: '2099-12-31' });
      component.closeGrant();
      component.openGrant(noSubscription);

      expect(component.grantForm.value.currentPeriodEnd).toBe('');
    });

    it('deve manter o modal aberto e exibir erro da API', () => {
      serviceMock.grant.and.returnValue(throwError(() => ({ status: 500 })));
      component.openGrant(noSubscription);
      component.confirmGrant();
      fixture.detectChanges();

      expect(component.grantTarget()).toEqual(noSubscription);
      expect(query('grant-error')?.textContent).toContain(
        'Não foi possível conceder o acesso. Tente novamente.',
      );
    });

    [
      [400, 'Verifique a validade informada.'],
      [404, 'Usuário não encontrado.'],
      [409, 'Este usuário já tem uma assinatura ativa na Stripe.'],
    ].forEach(([status, message]) => {
      it(`deve exibir mensagem específica para erro ${status}`, () => {
        serviceMock.grant.and.returnValue(throwError(() => ({ status })));
        component.openGrant(noSubscription);
        component.confirmGrant();
        fixture.detectChanges();

        expect(query('grant-error')?.textContent).toContain(message as string);
      });
    });
  });

  describe('modal de revogação', () => {
    it('deve pedir confirmação em modal customizado', () => {
      const confirmSpy = spyOn(window, 'confirm');
      component.openRevoke(manual);
      fixture.detectChanges();

      expect(query('revoke-modal')?.textContent).toContain('bruno@dindin.app');
      expect(serviceMock.revoke).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('deve fechar o modal sem revogar ao cancelar', () => {
      component.openRevoke(manual);
      component.closeRevoke();

      expect(component.revokeTarget()).toBeNull();
      expect(serviceMock.revoke).not.toHaveBeenCalled();
    });

    it('deve revogar ao confirmar', () => {
      component.openRevoke(manual);
      component.confirmRevoke();

      expect(serviceMock.revoke).toHaveBeenCalledWith('bruno');
      expect(component.revokeTarget()).toBeNull();
      expect(component.successMessage()).toBe(
        'Acesso de bruno@dindin.app revogado.',
      );
      expect(serviceMock.list).toHaveBeenCalledTimes(2);
    });

    it('deve exibir mensagem clara quando a assinatura é Stripe (409)', () => {
      serviceMock.revoke.and.returnValue(
        throwError(() => ({
          status: 409,
          error: { error: 'Only manual', code: 'STRIPE_SUBSCRIPTION' },
        })),
      );
      component.openRevoke(manual);
      component.confirmRevoke();
      fixture.detectChanges();

      expect(query('revoke-error')?.textContent).toContain(
        'Assinaturas da Stripe só podem ser canceladas pelo próprio usuário no portal de pagamento.',
      );
    });
  });
});
