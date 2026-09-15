export type QuantityMode = 'total' | 'add' | 'subtract';

export interface ResolvedQuantity {
  mode: QuantityMode;
  quantity: number;
}

export function resolveQuantity(
  _input: string | number | null,
  _currentQuantity: number,
): ResolvedQuantity | null {
  return null;
}

export function weightedAveragePrice(
  _currentQuantity: number,
  _currentPrice: number,
  _addedQuantity: number,
  _purchasePrice: number,
): number {
  return 0;
}
