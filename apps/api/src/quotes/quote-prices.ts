import { getFirestore } from 'firebase-admin/firestore';
import { Quote } from 'dindin-models';
import { quotesCollection } from '../firestore/paths';
import { validPrice } from '../shared/numbers';

/** Máximo de documentos por `getAll` (limite do Firestore). */
const GET_ALL_LIMIT = 500;

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

/**
 * Cotações dos tickers informados, indexadas em caixa alta (issue #299).
 *
 * Nas rotas HTTP o custo precisa acompanhar a carteira do usuário, não o
 * tamanho do catálogo: varrer `quotes` cobrava uma leitura por ativo
 * cadastrado a cada requisição, e a rota de renda mensal é chamada uma vez
 * por carteira. Os jobs continuam com `loadAllQuotePrices`, porque
 * processam todos os usuários.
 */
export async function getQuotesByTicker(
  tickers: string[],
): Promise<Map<string, Quote>> {
  const unique = [
    ...new Set(
      tickers
        .filter((ticker): ticker is string => typeof ticker === 'string')
        .map((ticker) => ticker.trim().toUpperCase())
        .filter((ticker) => ticker.length > 0),
    ),
  ];

  const quotes = new Map<string, Quote>();

  // `getAll` rejeita chamada sem nenhum documento.
  if (unique.length === 0) return quotes;

  const firestore = getFirestore();

  for (let index = 0; index < unique.length; index += GET_ALL_LIMIT) {
    const batch = unique.slice(index, index + GET_ALL_LIMIT);
    const snapshots = await firestore.getAll(
      ...batch.map((ticker) => quotesCollection().doc(ticker)),
    );

    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      quotes.set(snapshot.id.toUpperCase(), snapshot.data() as Quote);
    }
  }

  return quotes;
}

/**
 * Mapa `ticker → preço` apenas dos tickers informados (issue #221).
 *
 * Tickers repetidos são deduplicados e os sem cotação ficam **fora** do Map,
 * em vez de virarem zero: quem chama distingue "sem cotação" de "vale zero".
 */
export async function getQuotePricesByTicker(
  tickers: string[],
): Promise<Map<string, number>> {
  const quotes = await getQuotesByTicker(tickers);
  const prices = new Map<string, number>();

  for (const [ticker, quote] of quotes) {
    const price = validPrice(quote.price);
    if (price !== undefined) prices.set(ticker, price);
  }

  return prices;
}
