import {
  Component,
  computed,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import type { TickerValue } from 'dindin-shared-types';
import { formatCurrency, formatPercent } from '../../../utils/format.util';

export interface CompositionSlice {
  label: string;
  value: number;
  percent: number;
  color: string;
  path: string;
}

const COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#9ca3af',
];

const MAX_SLICES = COLORS.length;
const CENTER = 100;
const OUTER_RADIUS = 90;
const INNER_RADIUS = 55;

@Component({
  selector: 'app-composition-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composition-chart.component.html',
})
export class CompositionChartComponent {
  /**
   * Valor por ticker, já consolidado pela API (issue #300). Antes o gráfico
   * recebia as posições e refazia a soma no cliente.
   */
  readonly items = input.required<TickerValue[]>();

  readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + Math.max(item.value, 0), 0),
  );

  readonly hasData = computed(() => this.total() > 0);

  readonly slices = computed<CompositionSlice[]>(() => {
    const total = this.total();
    if (total <= 0) {
      return [];
    }

    const sorted = this.items()
      .filter((item) => item.value > 0)
      .map((item) => [item.ticker, item.value] as [string, number])
      .sort(([, a], [, b]) => b - a);
    const entries =
      sorted.length > MAX_SLICES
        ? [
            ...sorted.slice(0, MAX_SLICES - 1),
            [
              'Outros',
              sorted
                .slice(MAX_SLICES - 1)
                .reduce((sum, [, value]) => sum + value, 0),
            ] as [string, number],
          ]
        : sorted;

    let startAngle = 0;
    return entries.map(([label, value], index) => {
      const fraction = value / total;
      const endAngle = startAngle + fraction * 360;
      const path = this.arcPath(startAngle, endAngle, entries.length === 1);
      startAngle = endAngle;
      return {
        label,
        value,
        percent: fraction * 100,
        color: COLORS[index],
        path,
      };
    });
  });

  readonly formatCurrency = formatCurrency;
  readonly formatPercent = formatPercent;

  private arcPath(startAngle: number, endAngle: number, full: boolean): string {
    if (full) {
      const outerTop = this.point(OUTER_RADIUS, 0);
      const outerBottom = this.point(OUTER_RADIUS, 180);
      const innerTop = this.point(INNER_RADIUS, 0);
      const innerBottom = this.point(INNER_RADIUS, 180);
      return [
        `M ${outerTop} A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${outerBottom}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${outerTop}`,
        `M ${innerTop} A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerBottom}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerTop} Z`,
      ].join(' ');
    }

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const outerStart = this.point(OUTER_RADIUS, startAngle);
    const outerEnd = this.point(OUTER_RADIUS, endAngle);
    const innerEnd = this.point(INNER_RADIUS, endAngle);
    const innerStart = this.point(INNER_RADIUS, startAngle);
    return [
      `M ${outerStart}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd}`,
      `L ${innerEnd}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart}`,
      'Z',
    ].join(' ');
  }

  private point(radius: number, angle: number): string {
    const radians = ((angle - 90) * Math.PI) / 180;
    const x = CENTER + radius * Math.cos(radians);
    const y = CENTER + radius * Math.sin(radians);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }
}
