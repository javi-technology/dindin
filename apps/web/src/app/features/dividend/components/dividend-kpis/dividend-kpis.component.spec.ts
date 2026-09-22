import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DividendKpisComponent } from './dividend-kpis.component';

// ---------------------------------------------------------------------------
// Testes dos indicadores de proventos (issue #311)
//
// Saíram do dividend.component: recebem os números já calculados pelos utils
// compartilhados e só os apresentam.
// ---------------------------------------------------------------------------

describe('DividendKpisComponent', () => {
  let fixture: ComponentFixture<DividendKpisComponent>;

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(overrides: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(DividendKpisComponent);
    const inputs: Record<string, unknown> = {
      total: 450,
      totalFromFridge: 50,
      yearTotal: 4800,
      monthlyAverage: 400,
      lastMonth: { month: '2026-08', total: 420, variation: 5 },
      dividendYield: 8.5,
      yieldNeedsRecords: false,
      selectedYear: 2026,
      ...overrides,
    };
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DividendKpisComponent],
    }).compileComponents();
  });

  it('deve exibir a projeção mensal e a parte da geladeira', () => {
    setup();

    expect(element('[data-testid="total-value"]')?.textContent).toMatch(
      /R\$\s?450,00/,
    );
    expect(element('[data-testid="fridge-value"]')?.textContent).toMatch(
      /R\$\s?50,00/,
    );
  });

  it('deve exibir o total do ano escolhido', () => {
    setup();

    expect(element('[data-testid="kpi-year-total"]')?.textContent).toMatch(
      /R\$\s?4\.800,00/,
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '2026',
    );
  });

  it('deve exibir a média mensal e o dividend yield', () => {
    setup();

    expect(element('[data-testid="kpi-average"]')?.textContent).toMatch(
      /R\$\s?400,00/,
    );
    expect(element('[data-testid="kpi-yield"]')?.textContent).toContain('8,50');
  });

  describe('último mês', () => {
    it('deve exibir o mês formatado e a variação positiva', () => {
      setup();

      expect(element('[data-testid="kpi-last-month"]')?.textContent).toMatch(
        /R\$\s?420,00/,
      );
      const variacao = element(
        '[data-testid="kpi-last-month-variation"]',
      )?.textContent;
      expect(variacao).toContain('▲');
      expect(variacao).toContain('5,00');
    });

    it('deve exibir a variação negativa em módulo', () => {
      setup({
        lastMonth: { month: '2026-08', total: 380, variation: -12.5 },
      });

      const variacao = element(
        '[data-testid="kpi-last-month-variation"]',
      )?.textContent;

      expect(variacao).toContain('▼');
      expect(variacao).toContain('12,50');
      expect(variacao).not.toContain('-12,50');
    });

    it('deve omitir a variação no primeiro mês', () => {
      setup({
        lastMonth: { month: '2026-01', total: 380, variation: null },
      });

      expect(element('[data-testid="kpi-last-month-variation"]')).toBeNull();
    });

    it('deve omitir o cartão sem nenhum mês registrado', () => {
      setup({ lastMonth: null });

      expect(element('[data-testid="kpi-last-month"]')).toBeNull();
    });
  });

  describe('aviso do yield', () => {
    // Projeção sem proventos registrados mostra "R$ 450,00" ao lado de
    // "DY: 0,00%", o que parece defeito sem a explicação.
    it('deve explicar o yield zerado com projeção positiva', () => {
      setup({ dividendYield: 0, yieldNeedsRecords: true });

      expect(element('[data-testid="kpi-yield-note"]')?.textContent).toContain(
        'proventos já registrados',
      );
    });

    it('deve rotular como projeção anual quando há yield', () => {
      setup();

      expect(element('[data-testid="kpi-yield-note"]')).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Projeção anual',
      );
    });
  });
});
