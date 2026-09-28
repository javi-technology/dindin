import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AssetSimulationResponse } from 'dindin-shared-types';
import {
  AssetSimulationComponent,
  AssetSimulationRequestEvent,
} from './asset-simulation.component';

// ---------------------------------------------------------------------------
// Testes da simulação por ativo (issue #397)
//
// Ao contrário da simulação por carteira, esta é paga: a tela precisa dizer
// isso **antes** de o usuário preencher o formulário, e conduzir à assinatura
// em vez de só informar o bloqueio.
// ---------------------------------------------------------------------------

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
  byTicker: [
    {
      ticker: 'MXRF11',
      price: 10,
      monthlyDividend: 0.1,
      quantity: 100,
      finalQuantity: 100,
      investedAmount: 1000,
      monthlyIncome: 10,
      totalIncome: 10,
    },
  ],
  missingDividendTickers: [],
  staleDividendTickers: [],
  basis: {
    source: 'monthlyDividend',
    assumesRepetition: true,
    staleAfterDays: 90,
  },
  ticker: 'MXRF11',
} as AssetSimulationResponse;

describe('AssetSimulationComponent', () => {
  let fixture: ComponentFixture<AssetSimulationComponent>;
  let element: HTMLElement;
  let requested: AssetSimulationRequestEvent[];

  function render(inputs: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  function setInput(testId: string, value: string): void {
    const input = element.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    requested = [];
    await TestBed.configureTestingModule({
      imports: [AssetSimulationComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AssetSimulationComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.simulate.subscribe((event) =>
      requested.push(event),
    );
  });

  it('deve marcar o recurso como de assinante antes do preenchimento', () => {
    render({ hasAccess: false, showPaywall: true });

    expect(
      element.querySelector('[data-testid="asset-paywall"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="asset-ticker-input"]'),
    ).toBeNull();
  });

  it('deve conduzir ao fluxo de assinatura quando bloqueado', () => {
    render({ hasAccess: false, showPaywall: true });
    const cta = element.querySelector(
      '[data-testid="asset-paywall-cta"]',
    ) as HTMLAnchorElement;

    expect(cta.getAttribute('href')).toBe('/assinatura');
  });

  it('deve sinalizar o recurso como de assinante mesmo antes do paywall carregar', () => {
    render({ hasAccess: false, showPaywall: false });

    expect(
      element.querySelector('[data-testid="asset-subscriber-tag"]'),
    ).not.toBeNull();
  });

  it('deve liberar o formulário para quem assina', () => {
    render({ hasAccess: true, showPaywall: false });

    expect(element.querySelector('[data-testid="asset-paywall"]')).toBeNull();
    expect(
      element.querySelector('[data-testid="asset-ticker-input"]'),
    ).not.toBeNull();
  });

  it('deve pedir a simulação com ticker, valor, horizonte e modo', () => {
    render({ hasAccess: true, showPaywall: false });
    setInput('asset-ticker-input', 'mxrf11');
    setInput('asset-amount-input', '1.500,55');
    setInput('asset-months-input', '12');
    (
      element.querySelector(
        '[data-testid="asset-simulate-button"]',
      ) as HTMLElement
    ).click();

    expect(requested).toEqual([
      { ticker: 'MXRF11', amount: '1.500,55', months: 12, mode: 'withdraw' },
    ]);
  });

  it('deve recusar ticker ou valor vazios sem pedir a simulação', () => {
    render({ hasAccess: true, showPaywall: false });
    (
      element.querySelector(
        '[data-testid="asset-simulate-button"]',
      ) as HTMLElement
    ).click();
    fixture.detectChanges();

    expect(requested).toEqual([]);
    expect(
      element.querySelector('[data-testid="asset-simulation-error"]'),
    ).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Resultado obsoleto (issue #397)
  //
  // O resultado vem do pai e fica na tela até a próxima resposta. Sem avisar
  // que os campos mudaram, a projeção de MXRF11 continuava exibida depois de o
  // usuário trocar o formulário para outro ativo — número financeiro que não
  // corresponde ao que está escrito ao lado.
  // -------------------------------------------------------------------------
  describe('parâmetros alterados', () => {
    let changed: number;

    beforeEach(() => {
      changed = 0;
      fixture.componentInstance.parametersChanged.subscribe(
        () => (changed += 1),
      );
      render({ hasAccess: true, showPaywall: false });
    });

    it.each([
      ['asset-ticker-input', 'HGLG11'],
      ['asset-amount-input', '2000'],
      ['asset-months-input', '24'],
    ])('deve avisar ao editar %s', (testId, valor) => {
      setInput(testId, valor);

      expect(changed).toBe(1);
    });

    it('deve avisar ao trocar o modo', () => {
      const select = element.querySelector(
        '[data-testid="asset-mode-select"]',
      ) as HTMLSelectElement;
      select.value = 'reinvest';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(changed).toBe(1);
    });
  });

  it('deve mostrar as cotas, o provento e a premissa do resultado', () => {
    render({ hasAccess: true, showPaywall: false, result });

    const box = element.querySelector('[data-testid="simulation-result"]');
    expect(box?.textContent).toContain('MXRF11');
    expect(box?.textContent).toContain('100');
    expect(
      element.querySelector('[data-testid="projection-basis"]')?.textContent,
    ).toContain('não é promessa de rentabilidade');
  });

  it('deve mostrar o erro devolvido pela API', () => {
    render({
      hasAccess: true,
      showPaywall: false,
      error: 'Ativo não encontrado no catálogo',
    });

    expect(
      element.querySelector('[data-testid="asset-simulation-error"]')
        ?.textContent,
    ).toContain('Ativo não encontrado no catálogo');
  });
});
