import { roundCurrency } from './numbers';

/**
 * Compra de cotas inteiras com o troco (issue #395).
 *
 * A conta saiu de `ai-suggestion.allocation`, onde nasceu para a sugestão da
 * IA: valor dividido por preço só compra cota inteira, e o que sobra em cada
 * ativo, somado, costuma comprar mais uma cota em outro. A simulação de
 * proventos faz exatamente a mesma conta, e duas implementações da mesma
 * regra divergiriam no troco informado ao usuário.
 */

export interface WholeShareCandidate {
  /** Preço da cota; zero ou inválido deixa o candidato de fora. */
  price: number;
  /** Menor vem primeiro no desempate. */
  priority: number;
  /** Cotas já compradas; é incrementado em cada rodada. */
  quantity: number;
}

/**
 * Distribui `pool` entre os candidatos, uma cota por rodada, e devolve o que
 * sobrou.
 *
 * Quem ainda não tem nenhuma cota é atendido antes de quem já tem: sem isso o
 * ativo caro da carteira ficaria de fora enquanto o barato acumula cotas, e o
 * resultado deixaria de parecer a carteira que o usuário pediu. **Muta**
 * `quantity` dos candidatos.
 */
export function buyWholeSharesWithRemainder(
  candidates: WholeShareCandidate[],
  pool: number,
): number {
  const eligible = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(
      ({ candidate }) =>
        Number.isFinite(candidate.price) && candidate.price > 0,
    );

  let remaining = roundCurrency(pool);
  if (eligible.length === 0 || remaining <= 0) return remaining;

  let changed = true;
  while (changed) {
    changed = false;
    const ordered = [...eligible].sort(
      (a, b) =>
        Number(a.candidate.quantity > 0) - Number(b.candidate.quantity > 0) ||
        a.candidate.priority - b.candidate.priority ||
        a.index - b.index,
    );
    for (const { candidate } of ordered) {
      // A folga absorve o resíduo de ponto flutuante: sem ela um troco de
      // 10 guardado como 9,999999999 recusaria a cota de 10.
      if (remaining + 1e-9 < candidate.price) continue;
      candidate.quantity += 1;
      remaining = roundCurrency(remaining - candidate.price);
      changed = true;
    }
  }

  return remaining;
}
