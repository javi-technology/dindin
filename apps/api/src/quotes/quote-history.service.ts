import * as admin from 'firebase-admin';
import { Quote, QuoteHistory } from 'dindin-models';

function quotesCollection() {
  return admin.firestore().collection('quotes');
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
): Promise<void> {
  const now = new Date().toISOString();
  const date = todayDate();
  const docId = historyDocId();

  const quoteRef = quotesCollection().doc(ticker);

  let resolvedMonthlyDividend = monthlyDividend;
  if (resolvedMonthlyDividend === undefined) {
    const existing = await quoteRef.get();
    resolvedMonthlyDividend =
      (existing.data() as Quote | undefined)?.monthlyDividend ?? 0;
  }

  const quoteData: Quote = {
    ticker,
    price,
    monthlyDividend: resolvedMonthlyDividend,
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

/**
 * Retorna o preço mais recente conhecido para o ticker, lido diretamente
 * de `quotes/{ticker}`. Usado para resolver `currentPrice` em posições e
 * itens da geladeira no momento da leitura, sem depender de um valor
 * denormalizado gravado em cada documento.
 */
export async function getQuotePrice(
  ticker: string,
): Promise<number | undefined> {
  const doc = await quotesCollection().doc(ticker).get();
  if (!doc.exists) return undefined;
  return (doc.data() as Quote).price;
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
