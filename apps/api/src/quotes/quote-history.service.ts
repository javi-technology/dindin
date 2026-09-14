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
