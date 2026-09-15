import { parseDecimal } from './format.util';

export type QuantityMode = 'total' | 'add' | 'subtract';

export interface ResolvedQuantity {
  mode: QuantityMode;
  quantity: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Resolve a quantidade digitada no formulário de posição.
 * `+N` soma e `-N` subtrai `N` da quantidade atual; `N` define o total.
 * Retorna `null` quando o valor é inválido ou o resultado não é maior que zero.
 */
export function resolveQuantity(
  input: string | number | null,
  currentQuantity: number,
): ResolvedQuantity | null {
  const text = String(input ?? '').trim();
  const sign = text[0];
  const mode: QuantityMode =
    sign === '+' ? 'add' : sign === '-' ? 'subtract' : 'total';
  const amountText = mode === 'total' ? text : text.slice(1);
  const amount = /^\d/.test(amountText) ? parseDecimal(amountText) : null;

  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;

  const quantity =
    mode === 'add'
      ? currentQuantity + amount
      : mode === 'subtract'
        ? currentQuantity - amount
        : amount;

  return quantity > 0 ? { mode, quantity } : null;
}

/** Calcula o preço médio após uma compra, arredondado a 2 casas. */
export function weightedAveragePrice(
  currentQuantity: number,
  currentPrice: number,
  addedQuantity: number,
  purchasePrice: number,
): number {
  return round(
    (currentQuantity * currentPrice + addedQuantity * purchasePrice) /
      (currentQuantity + addedQuantity),
  );
}
