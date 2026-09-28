import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type {
  AssetSimulationResponse,
  WalletSimulationResponse,
} from 'dindin-shared-types';
import { signal } from '@angular/core';
import { BillingService } from '../../core/services/billing.service';
import { SimulationService } from '../../core/services/simulation.service';
import { SimulationComponent } from './simulation.component';

// ---------------------------------------------------------------------------
// Testes da tela de simulação (issue #396)
//
// A simulação geral é gratuita: a tela não consulta assinatura para liberar o
// formulário da carteira. O que ela precisa garantir é a escolha da carteira
// — está previsto haver mais de uma — e que o resultado apareça inteiro.
// ---------------------------------------------------------------------------

const wallets = [
  {
    slug: 'bb-fii',
    label: 'Banco do Brasil — FIIs',
    provider: 'BB' as const,
    months: ['2026-09', '2026-08'],
  },
  {
    slug: 'xp-fii',
    label: 'XP — FIIs',
    provider: 'BB' as const,
    months: ['2026-09'],
  },
];

const result = {
  amount: 1000,
  months: 1,
  mode: 'withdraw',
  allocatedAmount: 1000,
  unallocatedAmount: 0,
  monthlyIncome: 10,
  totalIncome: 10,
  reinvestedAmount: 0,
  uninvestedIncome: 0,
  byTicker: [],
  missingDividendTickers: [],
  staleDividendTickers: [],
  basis: {
    source: 'monthlyDividend',
    assumesRepetition: true,
    staleAfterDays: 90,
  },
  provider: wallets[0],
  walletMonth: '2026-09',
  tab: 'renda',
} as unknown as WalletSimulationResponse;

const assetResponse = {
  ...result,
  ticker: 'MXRF11',
} as unknown as AssetSimulationResponse;

describe('SimulationComponent', () => {
  let fixture: ComponentFixture<SimulationComponent>;
  let component: SimulationComponent;
  let element: HTMLElement;
  let simulateWallet: ReturnType<typeof vi.fn>;
  let simulateAsset: ReturnType<typeof vi.fn>;
  let listWallets: ReturnType<typeof vi.fn>;
  let billingServiceMock: {
    loadMe: ReturnType<typeof vi.fn>;
    loaded: ReturnType<typeof signal<boolean>>;
    hasProjections: ReturnType<typeof signal<boolean>>;
    subscriptionRequired: ReturnType<typeof signal<boolean>>;
  };

  function setInput(testId: string, value: string): void {
    const input = element.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function select(testId: string, value: string): void {
    const node = element.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLSelectElement;
    node.value = value;
    node.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function submit(): void {
    (
      element.querySelector('[data-testid="simulate-button"]') as HTMLElement
    ).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    listWallets = vi.fn().mockReturnValue(of(wallets));
    simulateWallet = vi.fn().mockReturnValue(of(result));
    simulateAsset = vi.fn().mockReturnValue(of(assetResponse));
    billingServiceMock = {
      loadMe: vi.fn().mockReturnValue(of({})),
      loaded: signal(true),
      hasProjections: signal(true),
      subscriptionRequired: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [SimulationComponent],
      providers: [
        provideRouter([]),
        {
          provide: SimulationService,
          useValue: { listWallets, simulateWallet, simulateAsset },
        },
        { provide: BillingService, useValue: billingServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SimulationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('deve oferecer a escolha da carteira sugerida', () => {
    const options = element.querySelectorAll(
      '[data-testid="provider-select"] option',
    );

    expect(options.length).toBe(2);
    expect(component.selectedProvider()).toBe('bb-fii');
  });

  it('deve listar os meses da carteira escolhida', () => {
    select('provider-select', 'xp-fii');

    expect(
      element.querySelectorAll('[data-testid="month-select"] option').length,
    ).toBe(1);
  });

  it('deve simular com valor, horizonte e modo informados', () => {
    setInput('amount-input', '1.500,55');
    setInput('months-input', '12');
    select('mode-select', 'reinvest');
    submit();

    expect(simulateWallet).toHaveBeenCalledWith({
      amount: '1.500,55',
      months: 12,
      mode: 'reinvest',
      provider: 'bb-fii',
      month: '2026-09',
      tab: 'renda',
    });
  });

  it('deve mostrar o resultado devolvido pela API', () => {
    setInput('amount-input', '1000');
    submit();

    expect(
      element.querySelector('[data-testid="simulation-result"]'),
    ).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Resultado obsoleto (issue #396)
  //
  // O resultado na tela vale para os filtros que o geraram. Enquanto a
  // requisição não era cancelada, trocar de carteira e receber a resposta
  // antiga em seguida mostrava a simulação da carteira anterior sob os filtros
  // novos — um número financeiro que o usuário não tem como saber que está
  // errado.
  // -------------------------------------------------------------------------
  describe('resultado obsoleto', () => {
    function pendingResponse(): Subject<WalletSimulationResponse> {
      const pending = new Subject<WalletSimulationResponse>();
      simulateWallet.mockReturnValue(pending);
      return pending;
    }

    function hasResult(): boolean {
      return (
        element.querySelector('[data-testid="simulation-result"]') !== null
      );
    }

    it('não deve exibir a resposta em voo depois de trocar a carteira', () => {
      setInput('amount-input', '1000');
      const pending = pendingResponse();
      submit();

      select('provider-select', 'xp-fii');
      pending.next(result);
      pending.complete();
      fixture.detectChanges();

      expect(hasResult()).toBe(false);
    });

    it('não deve exibir a resposta em voo depois de trocar o mês', () => {
      setInput('amount-input', '1000');
      const pending = pendingResponse();
      submit();

      select('month-select', '2026-08');
      pending.next(result);
      fixture.detectChanges();

      expect(hasResult()).toBe(false);
    });

    it.each([
      ['amount-input', '2000'],
      ['months-input', '24'],
    ])('deve descartar o resultado ao editar %s', (testId, valor) => {
      setInput('amount-input', '1000');
      submit();
      expect(hasResult()).toBe(true);

      setInput(testId, valor);

      expect(hasResult()).toBe(false);
    });

    it('deve descartar o resultado ao trocar o modo', () => {
      setInput('amount-input', '1000');
      submit();
      expect(hasResult()).toBe(true);

      select('mode-select', 'reinvest');

      expect(hasResult()).toBe(false);
    });

    // Pela tela o botão fica desabilitado enquanto carrega, então dois pedidos
    // não se sobrepõem por duplo clique. O componente não depende disso: quem
    // garante que a resposta antiga não vence é o `switchMap`.
    it('deve manter a última resposta pedida quando duas se sobrepõem', () => {
      setInput('amount-input', '1000');
      const primeira = pendingResponse();
      component.simulate();

      const segunda = pendingResponse();
      component.simulate();

      segunda.next(result);
      primeira.next({ ...result, monthlyIncome: 999 });
      fixture.detectChanges();

      expect(component.result()?.monthlyIncome).toBe(10);
    });

    it('deve desabilitar o botão enquanto a simulação está em voo', () => {
      setInput('amount-input', '1000');
      pendingResponse();
      submit();

      const botao = element.querySelector(
        '[data-testid="simulate-button"]',
      ) as HTMLButtonElement;
      expect(botao.disabled).toBe(true);
    });
  });

  it('deve recusar valor vazio sem chamar a API', () => {
    submit();

    expect(simulateWallet).not.toHaveBeenCalled();
    expect(
      element.querySelector('[data-testid="simulation-error"]')?.textContent,
    ).toContain('valor');
  });

  it('deve recusar valor não numérico sem chamar a API', () => {
    setInput('amount-input', 'abc');
    submit();

    expect(simulateWallet).not.toHaveBeenCalled();
    expect(
      element.querySelector('[data-testid="simulation-error"]'),
    ).not.toBeNull();
  });

  it('deve mostrar a mensagem de erro devolvida pela API', () => {
    simulateWallet.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { error: 'Valor a investir é obrigatório' },
      })),
    );
    setInput('amount-input', '1000');
    submit();

    expect(
      element.querySelector('[data-testid="simulation-error"]')?.textContent,
    ).toContain('Valor a investir é obrigatório');
  });

  it('deve liberar a simulação por ativo para quem assina', () => {
    expect(
      element.querySelector('[data-testid="asset-ticker-input"]'),
    ).not.toBeNull();
    expect(element.querySelector('[data-testid="asset-paywall"]')).toBeNull();
  });

  it('deve bloquear a simulação por ativo para quem não assina', () => {
    billingServiceMock.hasProjections.set(false);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="asset-paywall"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="asset-ticker-input"]'),
    ).toBeNull();
    // A simulação geral segue liberada: o bloqueio é só do recurso pago.
    expect(
      element.querySelector('[data-testid="simulate-button"]'),
    ).not.toBeNull();
  });

  it('deve simular o ativo pedido pelo componente filho', () => {
    setInput('asset-ticker-input', 'mxrf11');
    setInput('asset-amount-input', '1000');
    (
      element.querySelector(
        '[data-testid="asset-simulate-button"]',
      ) as HTMLElement
    ).click();
    fixture.detectChanges();

    expect(simulateAsset).toHaveBeenCalledWith({
      ticker: 'MXRF11',
      amount: '1000',
      months: 1,
      mode: 'withdraw',
    });
  });

  // O resultado do ativo vive no pai e é repassado ao filho. Se os campos
  // mudam, ele deixou de descrever o que está na tela (issue #397).
  describe('resultado obsoleto do ativo', () => {
    function clickAssetSimulate(): void {
      (
        element.querySelector(
          '[data-testid="asset-simulate-button"]',
        ) as HTMLElement
      ).click();
      fixture.detectChanges();
    }

    it('deve descartar o resultado do ativo ao editar o formulário', () => {
      setInput('asset-ticker-input', 'mxrf11');
      setInput('asset-amount-input', '1000');
      clickAssetSimulate();
      expect(component.assetResult()).not.toBeNull();

      setInput('asset-ticker-input', 'hglg11');

      expect(component.assetResult()).toBeNull();
    });

    it('não deve exibir a resposta em voo depois de editar o formulário', () => {
      const pending = new Subject<AssetSimulationResponse>();
      simulateAsset.mockReturnValue(pending);
      setInput('asset-ticker-input', 'mxrf11');
      setInput('asset-amount-input', '1000');
      clickAssetSimulate();

      setInput('asset-ticker-input', 'hglg11');
      pending.next(assetResponse);
      fixture.detectChanges();

      expect(component.assetResult()).toBeNull();
      expect(component.assetLoading()).toBe(false);
    });
  });

  it('deve avisar quando não há carteira sugerida disponível', () => {
    listWallets.mockReturnValue(of([]));
    const empty = TestBed.createComponent(SimulationComponent);
    empty.detectChanges();

    expect(
      (empty.nativeElement as HTMLElement).querySelector(
        '[data-testid="empty-wallets"]',
      ),
    ).not.toBeNull();
  });
});
