import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthlyDividendReport } from '../../../../core/services/dividend.service';
import { BarChartItem } from '../../../../shared/components/charts/bar-chart/bar-chart.component';
import { MonthlyReportComponent } from './monthly-report.component';

// ---------------------------------------------------------------------------
// Testes do relatório mensal (issue #311)
//
// Saiu do dividend.component. As séries dos gráficos chegam prontas dos utils
// compartilhados; a troca de ano é só avisada, quem recarrega é o pai.
// ---------------------------------------------------------------------------

describe('MonthlyReportComponent', () => {
  let fixture: ComponentFixture<MonthlyReportComponent>;
  let anos: Event[];

  const report: MonthlyDividendReport = {
    year: 2026,
    total: 480,
    availableYears: [2026, 2025],
    months: [
      { month: '2026-08', total: 200, byTicker: [] },
      { month: '2026-09', total: 280, byTicker: [] },
    ],
    byTicker: [
      { ticker: 'HGLG11', total: 300 },
      { ticker: 'KNRI11', total: 180 },
    ],
  };

  const series: BarChartItem[] = [
    { label: 'ago', value: 200 },
    { label: 'set', value: 280 },
  ];

  const concentration: BarChartItem[] = [
    { label: 'HGLG11', value: 300 },
    { label: 'KNRI11', value: 180 },
  ];

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function setup(overrides: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(MonthlyReportComponent);
    const inputs: Record<string, unknown> = {
      report,
      loading: false,
      error: null,
      selectedYear: 2026,
      years: [2026, 2025],
      series,
      concentration,
      monthlyAverage: 240,
      ...overrides,
    };
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    anos = [];
    fixture.componentInstance.yearChange.subscribe((event) => anos.push(event));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthlyReportComponent],
    }).compileComponents();
  });

  it('deve exibir o carregamento antes do relatório', () => {
    setup({ loading: true });

    expect(element('[data-testid="report-loading"]')).not.toBeNull();
    expect(element('[data-testid="monthly-chart"]')).toBeNull();
  });

  it('deve exibir o erro no lugar do relatório', () => {
    setup({ error: 'Erro ao carregar relatório mensal' });

    expect(element('[data-testid="report-error"]')?.textContent).toContain(
      'Erro ao carregar relatório mensal',
    );
    expect(element('[data-testid="monthly-chart"]')).toBeNull();
  });

  it('deve listar os anos disponíveis', () => {
    setup();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="year-select"] option',
    );

    expect(Array.from(options).map((o) => o.textContent?.trim())).toEqual([
      '2026',
      '2025',
    ]);
  });

  it('deve avisar a troca de ano', () => {
    setup();

    const select = element('[data-testid="year-select"]') as HTMLSelectElement;
    select.value = '2025';
    select.dispatchEvent(new Event('change'));

    expect(anos.length).toBe(1);
  });

  it('deve avisar quando o ano não tem provento registrado', () => {
    setup({ report: { ...report, months: [] } });

    expect(element('[data-testid="report-empty"]')?.textContent).toContain(
      'Nenhum provento registrado em 2026.',
    );
    expect(element('[data-testid="monthly-chart"]')).toBeNull();
  });

  it('deve desenhar os gráficos de meses e de concentração', () => {
    setup();

    expect(element('[data-testid="monthly-chart"]')).not.toBeNull();
    expect(element('[data-testid="concentration-chart"]')).not.toBeNull();
  });

  it('deve informar a média mensal que a linha tracejada marca', () => {
    setup();

    expect(element('[data-testid="monthly-chart"]')?.textContent).toMatch(
      /R\$\s?240,00/,
    );
  });

  it('deve manter os detalhamentos em blocos recolhíveis', () => {
    setup();

    expect(element('[data-testid="ticker-details"]')?.tagName).toBe('DETAILS');
  });
});
