import { Quote } from 'dindin-models';
import { quotesCollection } from '../firestore/paths';
import { validPrice } from '../shared/numbers';

/**
 * Mapa `ticker → preço`, num lugar só (issue #302).
 *
 * O mesmo mapa era montado de quatro formas — `patrimony-snapshot`,
 * `target-price`, `recommended-wallet.service` e `monthly-income` —, cada uma
 * com sua regra para preço ausente ou inválido. A divergência aparecia como
 * diferença de total entre a tela de patrimônio e a de carteira.
 */

/** Documento de cotação, no mínimo que o mapa precisa. */
interface QuoteDocument {
  id: string;
  data: () => unknown;
}

/**
 * `positiveOnly` descarta preço zero. O job de preço-alvo precisa disso: com
 * cotação zero, qualquer alvo pareceria atingido e o usuário receberia
 * e-mail de alerta indevido. Nos totais de patrimônio, zero é um valor
 * legítimo e o descarte deixaria o fallback de preço médio entrar no lugar.
 */
export function quotePricesFromDocs(
  docs: QuoteDocument[],
  { positiveOnly = false }: { positiveOnly?: boolean } = {},
): Map<string, number> {
  const prices = new Map<string, number>();

  for (const doc of docs) {
    const price = validPrice((doc.data() as Partial<Quote>).price);
    if (price !== undefined && (!positiveOnly || price > 0)) {
      prices.set(doc.id.toUpperCase(), price);
    }
  }

  return prices;
}

/**
 * Lê a coleção inteira de cotações. Vale para os jobs, que processam todos os
 * usuários: uma leitura por execução em vez de uma por ticker. Nas rotas HTTP,
 * use `getQuotePricesByTicker` (issue #299).
 */
export async function loadAllQuotePrices(
  options: { positiveOnly?: boolean } = {},
): Promise<Map<string, number>> {
  const snapshot = await quotesCollection().get();
  return quotePricesFromDocs(snapshot.docs, options);
}
