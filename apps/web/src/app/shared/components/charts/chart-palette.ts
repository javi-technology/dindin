/*
  Definição central da série categórica dos gráficos (issue #393). Um gráfico
  novo pega a cor daqui; não inventa a própria. Os valores são tokens da
  paleta, e não hexadecimais, para o gráfico acompanhar a troca de tema junto
  com o resto da tela.
*/

/** Série categórica, com o jade da marca na primeira posição. */
export const CHART_SERIES = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
] as const;

/** Fatia que agrupa o restante, quando as séries passam do limite. */
export const CHART_OTHER = 'var(--color-chart-other)';

/** Alta e baixa usam os mesmos tokens das tabelas. */
export const CHART_POSITIVE = 'var(--color-positive)';
export const CHART_NEGATIVE = 'var(--color-danger)';

/** Cor da série de índice `index`, com o excedente caindo em `CHART_OTHER`. */
export function chartColor(index: number): string {
  return CHART_SERIES[index] ?? CHART_OTHER;
}
