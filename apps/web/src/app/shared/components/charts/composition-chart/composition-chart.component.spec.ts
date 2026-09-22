import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { TickerValue } from 'dindin-shared-types';
import { CompositionChartComponent } from './composition-chart.component';

// A composição passou a chegar pronta da API (issue #300): o gráfico recebe
// valor por ticker, em vez de posições, e não refaz a soma no cliente.
describe('CompositionChartComponent', () => {
  let fixture: ComponentFixture<CompositionChartComponent>;

  const item = (ticker: string, value: number): TickerValue => ({
    ticker,
    value,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompositionChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CompositionChartComponent);
  });

  it('deve exibir estado vazio sem ativos', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="composition-empty"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="composition-chart"]'),
    ).toBeFalsy();
  });

  it('deve calcular percentuais com base no valor de cada ativo', () => {
    fixture.componentRef.setInput('items', [
      item('HGLG11', 1000),
      item('PETR4', 300),
    ]);
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices.map((slice) => slice.label)).toEqual(['HGLG11', 'PETR4']);
    expect(slices[0].percent).toBeCloseTo(76.92, 2);
    expect(slices[1].percent).toBeCloseTo(23.08, 2);
  });

  it('deve ignorar ativo sem valor', () => {
    fixture.componentRef.setInput('items', [
      item('HGLG11', 200),
      item('ZERO11', 0),
    ]);
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices).toHaveLength(1);
    expect(slices[0].value).toBe(200);
    expect(slices[0].percent).toBe(100);
  });

  it('deve renderizar uma fatia e um item de legenda por ticker', () => {
    fixture.componentRef.setInput('items', [
      item('HGLG11', 1000),
      item('PETR4', 1000),
      item('IVVB11', 1000),
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement;
    expect(
      element.querySelector('[data-testid="composition-chart"]'),
    ).toBeTruthy();
    expect(
      element.querySelectorAll('path[data-testid="composition-slice"]'),
    ).toHaveLength(3);
    const legend = element.querySelectorAll(
      '[data-testid="composition-legend-item"]',
    );
    expect(legend).toHaveLength(3);
    expect(legend[0].textContent).toContain('HGLG11');
    expect(legend[0].textContent).toContain('33,33%');
  });

  it('deve agrupar fatias excedentes em "Outros"', () => {
    fixture.componentRef.setInput(
      'items',
      Array.from({ length: 12 }, (_, index) =>
        item(`TICK${index}`, 100 - index),
      ),
    );
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices).toHaveLength(9);
    expect(slices[8].label).toBe('Outros');
    expect(slices[8].value).toBe(92 + 91 + 90 + 89);
  });
});
