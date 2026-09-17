export type DividendTrend = 'up' | 'down' | 'stable';

/**
 * Tendência do provento por cota comparando o último pagamento com o
 * anterior. Retorna `null` quando não há base de comparação.
 */
export function dividendTrend(values: number[]): DividendTrend | null {
  if (values.length < 2) {
    return null;
  }

  const last = values[values.length - 1];
  const previous = values[values.length - 2];

  if (last > previous) return 'up';
  if (last < previous) return 'down';
  return 'stable';
}
