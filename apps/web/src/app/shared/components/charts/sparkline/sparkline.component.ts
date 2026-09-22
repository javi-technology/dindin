import {
  Component,
  computed,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';

const WIDTH = 120;
const HEIGHT = 32;
const PADDING = 3;

@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sparkline.component.html',
})
export class SparklineComponent {
  readonly values = input.required<number[]>();
  readonly ariaLabel = input('Histórico');

  readonly hasData = computed(() => this.values().length >= 2);

  readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;

  readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) {
      return '';
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min;
    const usableHeight = HEIGHT - PADDING * 2;
    const step = (WIDTH - PADDING * 2) / (values.length - 1);

    return values
      .map((value, index) => {
        // Sem variação não há proporção a calcular: a linha fica no meio.
        const ratio = span === 0 ? 0.5 : (value - min) / span;
        const x = PADDING + index * step;
        const y = HEIGHT - PADDING - ratio * usableHeight;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  /**
   * Marcador do último ponto. O SVG é esticado na horizontal
   * (`preserveAspectRatio="none"`), o que transformaria um `<circle>` em
   * elipse achatada, então o marcador é um retângulo com raio de canto.
   */
  readonly lastPoint = computed(() => {
    const points = this.points();
    if (!points) {
      return null;
    }
    const [x, y] = points.split(' ').pop()!.split(',').map(Number);
    const size = 5;
    return { x: x - size / 2, y: y - size / 2, size };
  });
}
