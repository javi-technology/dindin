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

export async function saveQuoteHistory(
  ticker: string,
  price: number,
  source = 'brapi',
): Promise<void> {
  const now = new Date().toISOString();
  const date = todayDate();

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
  await historyCollection(ticker).doc(date).set(historyData);
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
