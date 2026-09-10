import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { MeResponse, PublicSubscription } from 'dindin-shared-types';
import { BillingComponent } from './billing.component';
import { BillingService } from '../../core/services/billing.service';

describe('BillingComponent', () => {
  let fixture: ComponentFixture<BillingComponent>;
  let billingServiceMock: {
    subscription: ReturnType<typeof signal<PublicSubscription>>;
    entitlements: ReturnType<typeof signal<string[]>>;
    loaded: ReturnType<typeof signal<boolean>>;
    hasAi: ReturnType<typeof signal<boolean>>;
    subscriptionRequired: ReturnType<typeof signal<boolean>>;
    loadMe: jasmine.Spy;
    startCheckout: jasmine.Spy;
    openPortal: jasmine.Spy;
  };

  const baseSubscription: PublicSubscription = {
    status: 'none',
    plan: null,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };

  const me: MeResponse = {
    uid: 'user-1',
    admin: false,
    subscription: baseSubscription,
    entitlements: [],
  };

  async function setup(
    subscription: PublicSubscription,
    queryParams: Record<string, string> = {},
    autoDetect = true,
  ) {
    billingServiceMock = {
      subscription: signal(subscription),
      entitlements: signal([]),
      loaded: signal(true),
      hasAi: signal(false),
      subscriptionRequired: signal(false),
      loadMe: jasmine
        .createSpy('loadMe')
        .and.returnValue(of({ ...me, subscription })),
      startCheckout: jasmine.createSpy('startCheckout').and.returnValue(of()),
      openPortal: jasmine.createSpy('openPortal').and.returnValue(of()),
    };

    await TestBed.configureTestingModule({
      imports: [BillingComponent],
      providers: [
        provideRouter([]),
        { provide: BillingService, useValue: billingServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingComponent);
    if (autoDetect) {
      fixture.detectChanges();
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('deve exibir os planos quando não há assinatura', async () => {
    await setup(baseSubscription);

    const plans = fixture.nativeElement.querySelector(
      '[data-testid="plans-section"]',
    );
    expect(plans).not.toBeNull();
    expect(plans.textContent).toContain('7 dias grátis');
    expect(plans.textContent).toContain('Mensal');
    expect(plans.textContent).toContain('R$ 10,00');
    expect(plans.textContent).toContain('Anual');
    expect(plans.textContent).toContain('R$ 100,00');
    expect(plans.textContent).toContain('2 meses grátis');
    expect(
      fixture.nativeElement.querySelector('[data-testid="canceled-note"]'),
    ).toBeNull();
  });

  it('deve exibir nota de cancelamento quando a assinatura foi encerrada', async () => {
    await setup({ ...baseSubscription, status: 'canceled' });

    expect(
      fixture.nativeElement.querySelector('[data-testid="plans-section"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="canceled-note"]')
        .textContent,
    ).toContain('Sua assinatura anterior foi encerrada.');
  });

  it('deve exibir a seção ativa com intervalo e próxima cobrança', async () => {
    await setup({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
    });

    const section = fixture.nativeElement.querySelector(
      '[data-testid="active-section"]',
    );
    expect(section.textContent).toContain('Plano Básico · Mensal');
    expect(section.textContent).toContain('Próxima cobrança em 01/10/2026');
    expect(
      fixture.nativeElement.querySelector('[data-testid="cancel-warning"]'),
    ).toBeNull();
  });

  it('deve exibir período de teste quando em trialing', async () => {
    await setup({
      status: 'trialing',
      plan: 'basic',
      interval: 'year',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
    });

    const section = fixture.nativeElement.querySelector(
      '[data-testid="active-section"]',
    );
    expect(section.textContent).toContain('Plano Básico · Anual');
    expect(section.textContent).toContain('Período de teste até 01/10/2026');
  });

  it('deve exibir aviso quando o cancelamento está agendado', async () => {
    await setup({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: true,
    });

    expect(
      fixture.nativeElement.querySelector('[data-testid="cancel-warning"]')
        .textContent,
    ).toContain('Cancelamento agendado');
  });

  it('deve exibir seção de pagamento pendente com botão de regularização', async () => {
    await setup({ ...baseSubscription, status: 'past_due' });

    const section = fixture.nativeElement.querySelector(
      '[data-testid="past-due-section"]',
    );
    expect(section.textContent).toContain('Pagamento pendente');
    expect(
      section.querySelector('[data-testid="manage-button"]').textContent,
    ).toContain('Regularizar pagamento');
  });

  it('deve iniciar checkout anual ao clicar em Assinar', async () => {
    await setup(baseSubscription);

    fixture.nativeElement
      .querySelector('[data-testid="subscribe-year-button"]')
      .click();

    expect(billingServiceMock.startCheckout).toHaveBeenCalledWith('year');
  });

  it('deve abrir o portal ao clicar em Gerenciar assinatura', async () => {
    await setup({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    fixture.nativeElement
      .querySelector('[data-testid="manage-button"]')
      .click();

    expect(billingServiceMock.openPortal).toHaveBeenCalled();
  });

  it('deve confirmar a assinatura via polling ao voltar do checkout', async () => {
    const subscribed: MeResponse = {
      ...me,
      subscription: {
        ...baseSubscription,
        status: 'active',
        plan: 'basic',
        interval: 'month',
      },
    };
    await setup(baseSubscription, { status: 'success' }, false);
    billingServiceMock.loadMe.and.returnValues(
      of({ ...me, subscription: baseSubscription }),
      of(subscribed),
    );

    fakeAsync(() => {
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="info-message"]')
          .textContent,
      ).toContain('Confirmando sua assinatura');
      expect(
        fixture.nativeElement.querySelector('[data-testid="success-message"]'),
      ).toBeNull();

      tick(2000);
      fixture.detectChanges();

      expect(billingServiceMock.loadMe).toHaveBeenCalledTimes(2);
      expect(
        fixture.nativeElement.querySelector('[data-testid="success-message"]')
          .textContent,
      ).toContain('Assinatura confirmada!');
      expect(
        fixture.nativeElement.querySelector('[data-testid="info-message"]'),
      ).toBeNull();
    })();
  });

  it('deve avisar para atualizar a página se a confirmação não chegar', async () => {
    await setup(baseSubscription, { status: 'success' }, false);

    fakeAsync(() => {
      fixture.detectChanges();
      tick(12000);
      fixture.detectChanges();

      expect(billingServiceMock.loadMe).toHaveBeenCalledTimes(6);
      expect(
        fixture.nativeElement.querySelector('[data-testid="info-message"]')
          .textContent,
      ).toContain('Pagamento recebido');
      expect(
        fixture.nativeElement.querySelector('[data-testid="success-message"]'),
      ).toBeNull();
    })();
  });

  it('deve exibir mensagem informativa ao cancelar o checkout', async () => {
    await setup(baseSubscription, { status: 'cancel' });

    expect(
      fixture.nativeElement.querySelector('[data-testid="info-message"]')
        .textContent,
    ).toContain('Checkout cancelado.');
  });

  it('deve exibir loading antes de carregar a assinatura', async () => {
    await setup(baseSubscription);
    billingServiceMock.loaded.set(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="billing-loading"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="plans-section"]'),
    ).toBeNull();
  });

  it('deve recarregar /api/me quando o checkout retornar 409', async () => {
    await setup(baseSubscription);
    billingServiceMock.startCheckout.and.returnValue(
      throwError(() => ({ status: 409 })),
    );
    billingServiceMock.loadMe.calls.reset();

    fixture.componentInstance.subscribe('month');

    expect(billingServiceMock.loadMe).toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('deve exibir erro quando o checkout falhar', async () => {
    await setup(baseSubscription);
    billingServiceMock.startCheckout.and.returnValue(
      throwError(() => ({ status: 500 })),
    );

    fixture.componentInstance.subscribe('month');
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(
      'Não foi possível iniciar o checkout. Tente novamente.',
    );
  });

  it('deve exibir erro quando o portal falhar', async () => {
    await setup({
      status: 'active',
      plan: 'basic',
      interval: 'month',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    billingServiceMock.openPortal.and.returnValue(
      throwError(() => ({ status: 404 })),
    );

    fixture.componentInstance.openPortal();

    expect(fixture.componentInstance.error()).toBe(
      'Não foi possível abrir o portal de assinatura. Tente novamente.',
    );
  });
});
