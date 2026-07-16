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
  source = 'brapi',
): Promise<void> {
  const now = new Date().toISOString();
  const date = todayDate();
  const docId = historyDocId();

  const quoteData: Quote = {
    ticker,
    price,
    updatedAt: now,
    source,
  };

  const historyData: QuoteHistory = {
    date,
    price,
    source,
  };

  await quotesCollection().doc(ticker).set(quoteData);
  await historyCollection(ticker).doc(docId).set(historyData);
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
