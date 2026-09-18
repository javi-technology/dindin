import { getFirestore } from 'firebase-admin/firestore';
import { FridgeItem, Position, Quote } from 'dindin-models';

export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  monthlyIncome: number;
  paymentDate?: string; // YYYY-MM-DD
}

export interface MonthlyIncome {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  monthlyDividendByTicker: Map<string, number>;
}

function positionsCollection(userId: string, walletId: string) {
  return getFirestore()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc(walletId)
    .collection('positions');
}

function fridgesCollection(userId: string) {
  return getFirestore().collection('users').doc(userId).collection('fridges');
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
    getFirestore().collection('quotes').get(),
    fetchFridgeItems(userId),
  ]);

  const monthlyDividendByTicker = new Map<string, number>();
  const averageMonthlyDividendByTicker = new Map<string, number>();
  const paymentDateByTicker = new Map<string, string>();
  for (const doc of quotesSnapshot.docs) {
    const data = doc.data() as Quote;
    const ticker = doc.id.toUpperCase();
    if (typeof data.dividendPaymentDate === 'string') {
      paymentDateByTicker.set(ticker, data.dividendPaymentDate);
    }
    if (
      typeof data.monthlyDividend === 'number' &&
      Number.isFinite(data.monthlyDividend)
    ) {
      monthlyDividendByTicker.set(ticker, data.monthlyDividend);
    }
    // O último provento só vale como renda mensal para quem paga todo mês;
    // a soma de 12 meses reflete a periodicidade real (#112). Sem ela
    // (cotação ainda não sincronizada), fica o último provento.
    const average =
      typeof data.annualDividend === 'number' &&
      Number.isFinite(data.annualDividend)
        ? data.annualDividend / 12
        : monthlyDividendByTicker.get(ticker);
    if (average !== undefined) {
      averageMonthlyDividendByTicker.set(ticker, average);
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
    const paymentDate = paymentDateByTicker.get(position.ticker.toUpperCase());

    const averageMonthlyDividend =
      averageMonthlyDividendByTicker.get(position.ticker.toUpperCase()) ?? 0;

    byTicker.push({
      ticker: position.ticker,
      quantity,
      monthlyDividend,
      monthlyIncome,
      ...(paymentDate && { paymentDate }),
    });
    total += roundCurrency(quantity * averageMonthlyDividend);
  }

  let totalFromFridge = 0;
  for (const item of fridgeItems) {
    const averageMonthlyDividend =
      averageMonthlyDividendByTicker.get(item.ticker.toUpperCase()) ?? 0;
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? item.quantity
        : 0;
    totalFromFridge += quantity * averageMonthlyDividend;
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
