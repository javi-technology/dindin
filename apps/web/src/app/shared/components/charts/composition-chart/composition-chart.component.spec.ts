import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Position } from 'dindin-models';
import { CompositionChartComponent } from './composition-chart.component';

describe('CompositionChartComponent', () => {
  let fixture: ComponentFixture<CompositionChartComponent>;

  const position = (overrides: Partial<Position>): Position => ({
    id: 'pos-1',
    walletId: 'w1',
    ticker: 'HGLG11',
    assetType: 'FII',
    quantity: 10,
    averagePrice: 100,
    inFridge: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompositionChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CompositionChartComponent);
  });

  it('deve exibir estado vazio sem posições', () => {
    fixture.componentRef.setInput('positions', []);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="composition-empty"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="composition-chart"]'),
    ).toBeFalsy();
  });

  it('deve calcular percentuais com base no valor de cada posição', () => {
    fixture.componentRef.setInput('positions', [
      position({ ticker: 'HGLG11', quantity: 10, averagePrice: 100 }),
      position({
        id: 'pos-2',
        ticker: 'PETR4',
        quantity: 10,
        averagePrice: 10,
        currentPrice: 30,
      }),
    ]);
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices.map((slice) => slice.label)).toEqual(['HGLG11', 'PETR4']);
    expect(slices[0].percent).toBeCloseTo(76.92, 2);
    expect(slices[1].percent).toBeCloseTo(23.08, 2);
  });

  it('deve agrupar posições do mesmo ticker em carteiras diferentes', () => {
    fixture.componentRef.setInput('positions', [
      position({ walletId: 'w1', quantity: 10, averagePrice: 10 }),
      position({ id: 'pos-2', walletId: 'w2', quantity: 10, averagePrice: 10 }),
    ]);
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices).toHaveSize(1);
    expect(slices[0].value).toBe(200);
    expect(slices[0].percent).toBe(100);
  });

  it('deve renderizar uma fatia e um item de legenda por ticker', () => {
    fixture.componentRef.setInput('positions', [
      position({ ticker: 'HGLG11' }),
      position({ id: 'pos-2', ticker: 'PETR4' }),
      position({ id: 'pos-3', ticker: 'IVVB11' }),
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement;
    expect(
      element.querySelector('[data-testid="composition-chart"]'),
    ).toBeTruthy();
    expect(
      element.querySelectorAll('path[data-testid="composition-slice"]'),
    ).toHaveSize(3);
    const legend = element.querySelectorAll(
      '[data-testid="composition-legend-item"]',
    );
    expect(legend).toHaveSize(3);
    expect(legend[0].textContent).toContain('HGLG11');
    expect(legend[0].textContent).toContain('33,33%');
  });

  it('deve agrupar fatias excedentes em "Outros"', () => {
    fixture.componentRef.setInput(
      'positions',
      Array.from({ length: 12 }, (_, index) =>
        position({
          id: `pos-${index}`,
          ticker: `TICK${index}`,
          quantity: 1,
          averagePrice: 100 - index,
        }),
      ),
    );
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    expect(slices).toHaveSize(9);
    expect(slices[8].label).toBe('Outros');
    expect(slices[8].value).toBe(92 + 91 + 90 + 89);
  });
});
