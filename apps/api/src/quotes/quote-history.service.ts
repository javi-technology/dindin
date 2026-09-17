import { getFirestore } from 'firebase-admin/firestore';
import { Quote, QuoteHistory } from 'dindin-models';

function quotesCollection() {
  return getFirestore().collection('quotes');
}

function historyCollection(ticker: string) {
  return quotesCollection().doc(ticker).collection('history');
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function historyDocId(): string {
  // Usa timestamp ISO com segundos para evitar sobrescrita no mesmo dia
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function saveQuoteHistory(
  ticker: string,
  price: number,
  monthlyDividend: number | undefined,
  source = 'brapi',
  dividendPaymentDate?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const date = todayDate();
  const docId = historyDocId();

  const quoteRef = quotesCollection().doc(ticker);

  let resolvedMonthlyDividend = monthlyDividend;
  let resolvedPaymentDate = dividendPaymentDate;
  if (resolvedMonthlyDividend === undefined) {
    const existing = (await quoteRef.get()).data() as Quote | undefined;
    resolvedMonthlyDividend = existing?.monthlyDividend ?? 0;
    resolvedPaymentDate = existing?.dividendPaymentDate;
  }

  const quoteData: Quote = {
    ticker,
    price,
    monthlyDividend: resolvedMonthlyDividend,
    ...(resolvedPaymentDate && { dividendPaymentDate: resolvedPaymentDate }),
    updatedAt: now,
    source,
  };

  const historyData: QuoteHistory = {
    date,
    price,
    monthlyDividend: resolvedMonthlyDividend,
    source,
  };

  await quoteRef.set(quoteData);
  await historyCollection(ticker).doc(docId).set(historyData);
}

/** Máximo de documentos aceitos numa chamada de `getAll` do Firestore. */
const GET_ALL_LIMIT = 500;

/**
 * Resolve o preço de vários tickers numa única ida ao Firestore (issue #221).
 *
 * A versão anterior lia um ticker por vez. Chamada em `Promise.all` sobre a
 * lista de tickers de uma carteira, o custo e a latência crescem linearmente
 * com a diversificação — 30 ativos distintos custavam 30 leituras a cada
 * listagem de posições. `getAll` resolve o mesmo em uma viagem.
 *
 * Tickers repetidos são deduplicados e os sem cotação ficam **fora** do Map,
 * em vez de virarem zero: quem chama distingue "sem cotação" de "vale zero".
 */
export async function getQuotePricesByTicker(
  tickers: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(tickers)];
  const prices = new Map<string, number>();

  // getAll() rejeita chamada sem nenhum documento.
  if (unique.length === 0) return prices;

  const firestore = getFirestore();

  for (let index = 0; index < unique.length; index += GET_ALL_LIMIT) {
    const batch = unique.slice(index, index + GET_ALL_LIMIT);
    const snapshots = await firestore.getAll(
      ...batch.map((ticker) => quotesCollection().doc(ticker)),
    );

    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const { price } = snapshot.data() as Quote;
      if (typeof price === 'number') prices.set(snapshot.id, price);
    });
  }

  return prices;
}

export async function getQuoteHistory(
  ticker: string,
  limit = 30,
): Promise<QuoteHistory[]> {
  const snapshot = await historyCollection(ticker)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as QuoteHistory);
}

/**
 * Snapshots de um ticker a partir de uma data (`YYYY-MM-DD`), do mais recente
 * para o mais antigo.
 *
 * Existe separado de `getQuoteHistory` porque a janela do histórico de
 * proventos é definida por período, não por contagem: o job grava um snapshot
 * por dia, então limitar por quantidade devolveria "os últimos N dias".
 */
export async function getQuoteHistorySince(
  ticker: string,
  sinceDate: string,
): Promise<QuoteHistory[]> {
  const snapshot = await historyCollection(ticker)
    .where('date', '>=', sinceDate)
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as QuoteHistory);
}
