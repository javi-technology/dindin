import {
  Component,
  computed,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { formatCompactCurrency } from '../../../utils/format.util';

export interface BarChartItem {
  label: string;
  value: number;
  /** Destaca a barra (ex: mês corrente). */
  highlight?: boolean;
  /** Texto exibido ao fim da barra na horizontal, no lugar do valor formatado. */
  valueLabel?: string;
}

export interface BarChartBar {
  label: string;
  value: number;
  highlight: boolean;
  valueLabel: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Posição do rótulo (eixo X na vertical, coluna da esquerda na horizontal). */
  labelX: number;
  labelY: number;
  /** Posição do valor exibido ao fim da barra (apenas na horizontal). */
  valueX: number;
}

export interface BarChartTick {
  position: number;
  label: string;
}

export type BarChartOrientation = 'vertical' | 'horizontal';

const VERTICAL = {
  left: 65,
  right: 580,
  top: 20,
  bottom: 185,
  labelY: 207,
  height: 220,
  maxBarWidth: 48,
};

const HORIZONTAL = {
  left: 120,
  right: 500,
  rowHeight: 32,
  barHeight: 20,
  labelX: 112,
};

const WIDTH = 600;
const TICK_COUNT = 4;

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.component.html',
})
export class BarChartComponent {
  readonly series = input.required<BarChartItem[]>();
  readonly orientation = input<BarChartOrientation>('vertical');
  /** Exibe a linha de média calculada a partir da própria série. */
  readonly averageLine = input(false);
  /**
   * Média informada por quem usa o gráfico, para casos em que ela não é a
   * média simples da série (ex: média só dos meses com provento registrado).
   * Quando informada, tem precedência sobre `averageLine`.
   */
  readonly averageValue = input<number | null>(null);
  readonly ariaLabel = input('Gráfico de barras');

  readonly hasData = computed(() => this.series().length > 0);

  readonly isHorizontal = computed(() => this.orientation() === 'horizontal');

  readonly viewBox = computed(() =>
    this.isHorizontal()
      ? `0 0 ${WIDTH} ${this.series().length * HORIZONTAL.rowHeight + 10}`
      : `0 0 ${WIDTH} ${VERTICAL.height}`,
  );

  readonly bars = computed<BarChartBar[]>(() =>
    this.isHorizontal() ? this.horizontalBars() : this.verticalBars(),
  );

  readonly yTicks = computed<BarChartTick[]>(() => {
    if (this.isHorizontal() || !this.hasData()) {
      return [];
    }

    const max = this.max();
    const span = VERTICAL.bottom - VERTICAL.top;
    return Array.from({ length: TICK_COUNT }, (_, index) => {
      const ratio = 1 - index / (TICK_COUNT - 1);
      return {
        position: VERTICAL.top + index * (span / (TICK_COUNT - 1)),
        label: formatCompactCurrency(max * ratio),
      };
    });
  });

  /** Posição da linha de média, ou `null` quando ela não deve ser exibida. */
  readonly averagePosition = computed<number | null>(() => {
    const explicit = this.averageValue();
    if (explicit === null && !this.averageLine()) {
      return null;
    }
    if (!this.hasData() || this.max() <= 0) {
      return null;
    }

    const series = this.series();
    const average =
      explicit ??
      series.reduce((sum, item) => sum + this.safeValue(item.value), 0) /
        series.length;

    if (average <= 0) {
      return null;
    }

    const ratio = average / this.max();

    return this.isHorizontal()
      ? HORIZONTAL.left + ratio * (HORIZONTAL.right - HORIZONTAL.left)
      : VERTICAL.bottom - ratio * (VERTICAL.bottom - VERTICAL.top);
  });

  readonly chartWidth = WIDTH;
  readonly verticalLeft = VERTICAL.left;
  readonly verticalRight = VERTICAL.right;
  readonly verticalTop = VERTICAL.top;
  readonly verticalBottom = VERTICAL.bottom;
  readonly horizontalLeft = HORIZONTAL.left;
  readonly horizontalRight = HORIZONTAL.right;

  readonly formatCompactCurrency = formatCompactCurrency;

  private safeValue(value: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : 0;
  }

  private max(): number {
    return Math.max(
      ...this.series().map((item) => this.safeValue(item.value)),
      0,
    );
  }

  private verticalBars(): BarChartBar[] {
    const series = this.series();
    const denominator = this.max() || 1;
    const span = VERTICAL.bottom - VERTICAL.top;
    const slot = (VERTICAL.right - VERTICAL.left) / series.length;
    const barWidth = Math.min(slot * 0.6, VERTICAL.maxBarWidth);

    return series.map((item, index) => {
      const height = (this.safeValue(item.value) / denominator) * span;
      const slotStart = VERTICAL.left + index * slot;
      return {
        label: item.label,
        value: item.value,
        highlight: item.highlight === true,
        valueLabel: item.valueLabel ?? null,
        x: slotStart + (slot - barWidth) / 2,
        y: VERTICAL.bottom - height,
        width: barWidth,
        height,
        labelX: slotStart + slot / 2,
        labelY: VERTICAL.labelY,
        valueX: 0,
      };
    });
  }

  private horizontalBars(): BarChartBar[] {
    const denominator = this.max() || 1;
    const span = HORIZONTAL.right - HORIZONTAL.left;
    const offset = (HORIZONTAL.rowHeight - HORIZONTAL.barHeight) / 2;

    return this.series().map((item, index) => {
      const width = (this.safeValue(item.value) / denominator) * span;
      const y = index * HORIZONTAL.rowHeight + offset;
      return {
        label: item.label,
        value: item.value,
        highlight: item.highlight === true,
        valueLabel: item.valueLabel ?? null,
        x: HORIZONTAL.left,
        y,
        width,
        height: HORIZONTAL.barHeight,
        labelX: HORIZONTAL.labelX,
        labelY: y + HORIZONTAL.barHeight / 2 + 4,
        valueX: HORIZONTAL.left + width + 8,
      };
    });
  }
}
