import { Component, computed, input } from '@angular/core';
import { PatrimonySnapshot } from 'dindin-models';
import { formatCompactCurrency } from '../../../shared/utils/format.util';

interface ChartPoint {
  x: number;
  y: number;
  value: number;
}

interface ChartTick {
  y: number;
  value: number;
  label: string;
}

@Component({
  selector: 'app-patrimony-chart',
  standalone: true,
  templateUrl: './patrimony-chart.component.html',
})
export class PatrimonyChartComponent {
  readonly snapshots = input.required<PatrimonySnapshot[]>();
  readonly hasEnoughData = computed(() => this.snapshots().length >= 2);

  readonly points = computed<ChartPoint[]>(() => {
    const snapshots = this.snapshots();
    if (snapshots.length === 0) {
      return [];
    }

    const max = Math.max(...snapshots.map((snapshot) => snapshot.total), 0);
    const denominator = max || 1;
    const width = 515;
    const left = 65;
    const top = 20;
    const bottom = 185;
    const step = snapshots.length > 1 ? width / (snapshots.length - 1) : 0;

    return snapshots.map((snapshot, index) => ({
      x: left + index * step,
      y: bottom - (Math.max(snapshot.total, 0) / denominator) * (bottom - top),
      value: snapshot.total,
    }));
  });

  readonly linePath = computed(() =>
    this.points()
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  );

  readonly areaPath = computed(() => {
    const points = this.points();
    if (points.length === 0) {
      return '';
    }

    const baseline = 185;
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x} ${baseline} L ${points
      .map((point) => `${point.x} ${point.y}`)
      .join(' L ')} L ${last.x} ${baseline} Z`;
  });

  readonly yTicks = computed<ChartTick[]>(() => {
    const max = Math.max(
      ...this.snapshots().map((snapshot) => snapshot.total),
      0,
    );
    const top = 20;
    const bottom = 185;
    return Array.from({ length: 4 }, (_, index) => {
      const ratio = 1 - index / 3;
      const value = max * ratio;
      return {
        y: top + index * ((bottom - top) / 3),
        value,
        label: formatCompactCurrency(value),
      };
    });
  });

  readonly formatCompactCurrency = formatCompactCurrency;

  formatDate(date: string): string {
    const [, month, day] = date.split('-');
    return `${day}/${month}`;
  }
}
