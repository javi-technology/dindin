/**
 * Helpers numéricos compartilhados (issue #302).
 *
 * `roundCurrency` existia em `patrimony-snapshot`, `monthly-income` e
 * `dividend-sync-record`; `validQuantity` em três arquivos e `validPrice` em
 * dois, cada um com sua variação. O que chega do Firestore é `unknown` —
 * documento antigo, importação manual ou bug de gravação podem trazer string,
 * `null` ou `NaN` —, e um `NaN` se espalha por toda a soma do patrimônio sem
 * erro nenhum.
 */

/** Arredonda para duas casas, eliminando resíduo de ponto flutuante. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Quantidade utilizável; qualquer coisa fora disso conta como zero. */
export function validQuantity(quantity: unknown): number {
  return typeof quantity === 'number' &&
    Number.isFinite(quantity) &&
    quantity >= 0
    ? quantity
    : 0;
}

/**
 * Preço utilizável, ou `undefined` — quem chama decide o fallback (preço
 * médio da posição ou preço de transferência do item).
 */
export function validPrice(price: unknown): number | undefined {
  return typeof price === 'number' && Number.isFinite(price)
    ? price
    : undefined;
}

/**
 * Preço estritamente positivo, ou `undefined`. O job de preço-alvo usa esta
 * variante: com preço (ou alvo) zero, qualquer comparação pareceria atingida
 * e o usuário receberia e-mail de alerta indevido.
 */
export function validPositivePrice(price: unknown): number | undefined {
  const value = validPrice(price);
  return value !== undefined && value > 0 ? value : undefined;
}
