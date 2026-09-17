import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PatrimonySnapshot } from 'dindin-models';
import { PatrimonyChartComponent } from './patrimony-chart.component';

describe('PatrimonyChartComponent', () => {
  let fixture: ComponentFixture<PatrimonyChartComponent>;

  const snapshot = (date: string, total: number): PatrimonySnapshot => ({
    id: date,
    userId: 'user-1',
    date,
    totalWallet: total,
    totalFridge: 0,
    total,
    createdAt: `${date}T00:00:00Z`,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatrimonyChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PatrimonyChartComponent);
  });

  it('deve exibir estado vazio sem histórico', () => {
    fixture.componentRef.setInput('snapshots', []);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="patrimony-empty"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="patrimony-chart"]'),
    ).toBeFalsy();
  });

  it('deve exibir estado vazio com apenas um snapshot', () => {
    fixture.componentRef.setInput('snapshots', [snapshot('2026-08-27', 100)]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="patrimony-empty"]'),
    ).toBeTruthy();
  });

  it('deve renderizar pontos, linha e área com três snapshots', () => {
    fixture.componentRef.setInput('snapshots', [
      snapshot('2026-08-25', 100),
      snapshot('2026-08-26', 200),
      snapshot('2026-08-27', 150),
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement;
    expect(
      element.querySelector('[data-testid="patrimony-chart"]'),
    ).toBeTruthy();
    expect(element.querySelectorAll('circle')).toHaveSize(3);
    expect(element.querySelector('polyline')).toBeTruthy();
    expect(
      element.querySelector('path[data-testid="patrimony-area"]'),
    ).toBeTruthy();
    expect(
      element.querySelector('[data-testid="date-start"]').textContent,
    ).toContain('25/08');
    expect(
      element.querySelector('[data-testid="date-end"]').textContent,
    ).toContain('27/08');
  });

  it('deve mapear o maior total para o topo da área do gráfico', () => {
    fixture.componentRef.setInput('snapshots', [
      snapshot('2026-08-25', 100),
      snapshot('2026-08-26', 300),
    ]);
    fixture.detectChanges();

    const point = fixture.componentInstance.points()[1];
    expect(point.y).toBe(20);
  });
});
