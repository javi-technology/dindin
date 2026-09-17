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

  it('deve aplicar o aria-label informado no gráfico', () => {
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('ariaLabel', 'Proventos por mês');
    fixture.detectChanges();

    const svg = element().querySelector('[data-testid="bar-chart"]');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Proventos por mês');
  });
});
