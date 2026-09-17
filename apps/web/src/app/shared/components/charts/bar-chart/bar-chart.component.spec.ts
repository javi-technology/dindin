import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarChartComponent, BarChartItem } from './bar-chart.component';

describe('BarChartComponent', () => {
  let fixture: ComponentFixture<BarChartComponent>;

  const series: BarChartItem[] = [
    { label: 'jan', value: 100 },
    { label: 'fev', value: 50 },
    { label: 'mar', value: 200 },
  ];

  const element = (): HTMLElement => fixture.nativeElement;
  const bars = (): SVGRectElement[] =>
    Array.from(element().querySelectorAll('[data-testid="bar"]'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BarChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(BarChartComponent);
  });

  it('deve exibir estado vazio quando a série está vazia', () => {
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-empty"]'),
    ).toBeTruthy();
    expect(element().querySelector('[data-testid="bar-chart"]')).toBeNull();
  });

  it('deve renderizar uma barra por item da série', () => {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();

    expect(bars().length).toBe(3);
    expect(element().textContent).toContain('jan');
    expect(element().textContent).toContain('mar');
  });

  it('deve dimensionar as barras proporcionalmente ao maior valor', () => {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();

    const [jan, fev, mar] = bars().map((bar) =>
      Number(bar.getAttribute('height')),
    );

    expect(mar).toBeGreaterThan(jan);
    expect(jan).toBeGreaterThan(fev);
    expect(jan / mar).toBeCloseTo(0.5, 2);
    expect(fev / mar).toBeCloseTo(0.25, 2);
  });

  it('deve renderizar barras zeradas sem cair no estado vazio', () => {
    fixture.componentRef.setInput('series', [
      { label: 'jan', value: 0 },
      { label: 'fev', value: 0 },
    ]);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-empty"]'),
    ).toBeNull();
    expect(bars().length).toBe(2);
    bars().forEach((bar) => {
      expect(Number(bar.getAttribute('height'))).toBe(0);
    });
  });

  it('deve destacar apenas a barra marcada com highlight', () => {
    fixture.componentRef.setInput('series', [
      { label: 'jan', value: 100 },
      { label: 'fev', value: 80, highlight: true },
    ]);
    fixture.detectChanges();

    const destacadas = bars().filter(
      (bar) => bar.getAttribute('data-highlight') === 'true',
    );

    expect(destacadas.length).toBe(1);
  });

  it('deve renderizar a linha de média quando solicitada', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('averageLine', true);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-average"]'),
    ).toBeTruthy();
  });

  it('deve omitir a linha de média por padrão', () => {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-average"]'),
    ).toBeNull();
  });

  it('deve omitir a linha de média quando todos os valores são zero', () => {
    fixture.componentRef.setInput('series', [
      { label: 'jan', value: 0 },
      { label: 'fev', value: 0 },
    ]);
    fixture.componentRef.setInput('averageLine', true);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-average"]'),
    ).toBeNull();
  });

  it('deve posicionar a linha de média no averageValue informado', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('averageValue', 150);
    fixture.detectChanges();

    const linha = element().querySelector('[data-testid="bar-chart-average"]');

    // 150 de 200 (maior valor) => 75% da altura útil, medida a partir da base.
    expect(Number(linha?.getAttribute('y1'))).toBeCloseTo(61.25, 2);
  });

  it('deve preferir o averageValue à média calculada da série', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('averageLine', true);
    fixture.componentRef.setInput('averageValue', 200);
    fixture.detectChanges();

    const linha = element().querySelector('[data-testid="bar-chart-average"]');

    // 200 é o maior valor da série, então a linha fica no topo da área útil.
    expect(Number(linha?.getAttribute('y1'))).toBeCloseTo(20, 2);
  });

  it('deve omitir a linha quando o averageValue não é positivo', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('averageValue', 0);
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-chart-average"]'),
    ).toBeNull();
  });

  it('deve dimensionar as barras na horizontal pela largura', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('orientation', 'horizontal');
    fixture.detectChanges();

    const [jan, , mar] = bars().map((bar) => Number(bar.getAttribute('width')));

    expect(mar).toBeGreaterThan(jan);
    expect(jan / mar).toBeCloseTo(0.5, 2);
    bars().forEach((bar) => {
      expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0);
    });
  });

  it('deve exibir o valueLabel do item no lugar do valor formatado', () => {
    fixture.componentRef.setInput('series', [
      { label: 'HGLG11', value: 270, valueLabel: 'R$ 270,00 · 90,0%' },
    ]);
    fixture.componentRef.setInput('orientation', 'horizontal');
    fixture.detectChanges();

    expect(
      element().querySelector('[data-testid="bar-value"]')?.textContent?.trim(),
    ).toBe('R$ 270,00 · 90,0%');
  });

  it('deve aplicar o aria-label informado no gráfico', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('ariaLabel', 'Proventos por mês');
    fixture.detectChanges();

    const svg = element().querySelector('[data-testid="bar-chart"]');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Proventos por mês');
  });
});
