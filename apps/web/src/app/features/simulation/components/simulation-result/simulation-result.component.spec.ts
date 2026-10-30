import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { WalletSimulationResponse } from 'dindin-shared-types';
import { SimulationResultComponent } from './simulation-result.component';

// ---------------------------------------------------------------------------
// Testes do resultado da simulação (issue #396)
//
// O resultado chega pronto da API — o componente só o exibe. O que ele precisa
// garantir é que nada da premissa fique implícito: troco, provento ausente e
// "não é promessa de rentabilidade" aparecem na tela, não só no payload.
// ---------------------------------------------------------------------------

const result: WalletSimulationResponse = {
  amount: 1000,
  months: 12,
  mode: 'withdraw',
  allocatedAmount: 990,
  unallocatedAmount: 10,
  monthlyIncome: 10,
  totalIncome: 120,
  reinvestedAmount: 0,
  uninvestedIncome: 0,
  byTicker: [
    {
      ticker: 'AAAA11',
      price: 10,
      monthlyDividend: 0.1,
      quantity: 50,
      finalQuantity: 50,
      investedAmount: 500,
      monthlyIncome: 5,
      totalIncome: 60,
    },
    {
      ticker: 'SEMP11',
      price: 20,
      monthlyDividend: 0,
      quantity: 24,
      finalQuantity: 24,
      investedAmount: 480,
      monthlyIncome: 0,
      totalIncome: 0,
      missingDividend: true,
    },
  ],
  missingDividendTickers: ['SEMP11'],
  staleDividendTickers: [],
  basis: {
    source: 'monthlyDividend',
    assumesRepetition: true,
    staleAfterDays: 90,
  },
  provider: { slug: 'bb-fii', label: 'Banco do Brasil — FIIs', provider: 'BB' },
  walletMonth: '2026-09',
  tab: 'renda',
};

describe('SimulationResultComponent', () => {
  let fixture: ComponentFixture<SimulationResultComponent>;

  function render(value: WalletSimulationResponse): HTMLElement {
    fixture.componentRef.setInput('result', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationResultComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SimulationResultComponent);
  });

  it('deve mostrar a renda projetada no período', () => {
    const element = render(result);

    expect(
      element.querySelector('[data-testid="total-income"]')?.textContent,
    ).toContain('120,00');
  });

  it('deve detalhar cada ativo com as cotas compradas', () => {
    const element = render(result);
    const rows = element.querySelectorAll('[data-testid="asset-row"]');

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('AAAA11');
    expect(rows[0].textContent).toContain('50');
  });

  it('deve mostrar o troco não alocado', () => {
    const element = render(result);

    expect(
      element.querySelector('[data-testid="unallocated-amount"]')?.textContent,
    ).toContain('10,00');
  });

  it('deve omitir o troco quando tudo foi alocado', () => {
    const element = render({ ...result, unallocatedAmount: 0 });

    expect(
      element.querySelector('[data-testid="unallocated-amount"]'),
    ).toBeNull();
  });

  it('deve informar a premissa da projeção sem prometer rentabilidade', () => {
    const element = render(result);
    const basis = element.querySelector('[data-testid="projection-basis"]');

    expect(basis?.textContent).toContain('último provento');
    expect(basis?.textContent).toContain('não é promessa de rentabilidade');
  });

  it('deve sinalizar o ativo sem provento conhecido', () => {
    const element = render(result);
    const badges = element.querySelectorAll(
      '[data-testid="missing-dividend-badge"]',
    );

    expect(badges.length).toBe(1);
    expect(
      element.querySelectorAll('[data-testid="asset-row"]')[1].textContent,
    ).toContain('SEMP11');
  });

  it('deve mostrar as cotas ao fim do horizonte quando há reinvestimento', () => {
    const element = render({
      ...result,
      mode: 'reinvest',
      reinvestedAmount: 100,
      byTicker: [{ ...result.byTicker[0], finalQuantity: 60 }],
    });

    expect(
      element.querySelector('[data-testid="final-quantity"]')?.textContent,
    ).toContain('60');
  });

  it('não deve mostrar cotas finais no modo de saque', () => {
    const element = render(result);

    expect(element.querySelector('[data-testid="final-quantity"]')).toBeNull();
  });

  // Issue #574: com horizonte curto, o total do período é igual nos dois
  // modos, e só a renda ao fim do período e as cotas novas mostram o efeito.
  it('deve mostrar a renda mensal ao fim do período quando há reinvestimento', () => {
    const element = render({
      ...result,
      mode: 'reinvest',
      reinvestedAmount: 100,
      finalMonthlyIncome: 11,
    });

    expect(
      element.querySelector('[data-testid="final-monthly-income"]')
        ?.textContent,
    ).toContain('11,00');
  });

  it('deve somar as cotas compradas com proventos no período', () => {
    const element = render({
      ...result,
      mode: 'reinvest',
      reinvestedAmount: 100,
      finalMonthlyIncome: 11,
      byTicker: [
        { ...result.byTicker[0], finalQuantity: 60 },
        { ...result.byTicker[1], finalQuantity: 25 },
      ],
    });

    expect(
      element.querySelector('[data-testid="reinvested-shares"]')?.textContent,
    ).toContain('11 novas cotas');
  });

  it('não deve mostrar a renda mensal final no modo de saque', () => {
    const element = render({ ...result, finalMonthlyIncome: 10 });

    expect(
      element.querySelector('[data-testid="final-monthly-income"]'),
    ).toBeNull();
  });

  it('deve avisar quando os proventos não completaram nenhuma cota', () => {
    const element = render({
      ...result,
      mode: 'reinvest',
      months: 1,
      reinvestedAmount: 0,
      uninvestedIncome: 10.4,
      finalMonthlyIncome: 10,
    });

    const notice = element.querySelector(
      '[data-testid="reinvest-without-effect"]',
    )?.textContent;
    expect(notice).toContain('10,40');
    expect(notice).toContain('cota inteira');
  });

  it('não deve avisar sobre o reinvestimento no modo de saque', () => {
    const element = render(result);

    expect(
      element.querySelector('[data-testid="reinvest-without-effect"]'),
    ).toBeNull();
  });
});
