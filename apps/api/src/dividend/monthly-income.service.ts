import * as admin from 'firebase-admin';
import { FridgeItem, Position, Quote } from 'dindin-models';

export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  monthlyIncome: number;
}

export interface MonthlyIncome {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  monthlyDividendByTicker: Map<string, number>;
}

function positionsCollection(userId: string, walletId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc(walletId)
    .collection('positions');
}

function fridgesCollection(userId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('fridges');
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function fetchFridgeItems(userId: string): Promise<FridgeItem[]> {
  const items: FridgeItem[] = [];
  const fridgesSnapshot = await fridgesCollection(userId).get();

  for (const fridgeDoc of fridgesSnapshot.docs) {
    const itemsSnapshot = await fridgeDoc.ref.collection('fridgeItems').get();
    for (const itemDoc of itemsSnapshot.docs) {
      items.push({ id: itemDoc.id, ...itemDoc.data() } as FridgeItem);
    }
  }

  return items;
}

export async function computeMonthlyIncome(
  userId: string,
  walletId: string,
): Promise<MonthlyIncome> {
  const [positionsSnapshot, quotesSnapshot, fridgeItems] = await Promise.all([
    positionsCollection(userId, walletId).get(),
    admin.firestore().collection('quotes').get(),
    fetchFridgeItems(userId),
  ]);

  const monthlyDividendByTicker = new Map<string, number>();
  for (const doc of quotesSnapshot.docs) {
    const data = doc.data() as Quote;
    if (
      typeof data.monthlyDividend === 'number' &&
      Number.isFinite(data.monthlyDividend)
    ) {
      monthlyDividendByTicker.set(doc.id.toUpperCase(), data.monthlyDividend);
    }
  }

  const byTicker: MonthlyIncomeItem[] = [];
  let total = 0;

  for (const doc of positionsSnapshot.docs) {
    const position = { id: doc.id, ...doc.data() } as Position;
    const monthlyDividend =
      monthlyDividendByTicker.get(position.ticker.toUpperCase()) ?? 0;
    const quantity =
      typeof position.quantity === 'number' &&
      Number.isFinite(position.quantity)
        ? position.quantity
        : 0;
    const monthlyIncome = roundCurrency(quantity * monthlyDividend);

    byTicker.push({
      ticker: position.ticker,
      quantity,
      monthlyDividend,
      monthlyIncome,
    });
    total += monthlyIncome;
  }

  let totalFromFridge = 0;
  for (const item of fridgeItems) {
    const monthlyDividend =
      monthlyDividendByTicker.get(item.ticker.toUpperCase()) ?? 0;
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? item.quantity
        : 0;
    totalFromFridge += quantity * monthlyDividend;
  }
  totalFromFridge = roundCurrency(totalFromFridge);
  total = roundCurrency(total + totalFromFridge);
  byTicker.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    byTicker,
    total,
    totalFromFridge,
    monthlyDividendByTicker,
  };
}
