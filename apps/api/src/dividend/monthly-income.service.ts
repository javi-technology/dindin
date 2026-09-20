import { FridgeItem, Position, Quote } from 'dindin-models';
import { positionsCollection, quotesCollection } from '../firestore/paths';
import { roundCurrency, validQuantity } from '../shared/numbers';
import { getAllUserFridgeItems } from '../wallet/fridge-reader';

export interface MonthlyIncomeItem {
  ticker: string;
  quantity: number;
  monthlyDividend: number;
  /** Último provento pago informado pela Brapi × quantidade (#290). */
  monthlyIncome: number;
  paymentDate?: string; // YYYY-MM-DD
}

export interface MonthlyIncome {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  monthlyDividendByTicker: Map<string, number>;
}

export const fetchFridgeItems = getAllUserFridgeItems;

export async function computeMonthlyIncome(
  userId: string,
  walletId: string,
): Promise<MonthlyIncome> {
  const [positionsSnapshot, quotesSnapshot, fridgeItems] = await Promise.all([
    positionsCollection(userId, walletId).get(),
    quotesCollection().get(),
    fetchFridgeItems(userId),
  ]);

  const monthlyDividendByTicker = new Map<string, number>();
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
  }

  const byTicker: MonthlyIncomeItem[] = [];
  let total = 0;

  for (const doc of positionsSnapshot.docs) {
    const position = { id: doc.id, ...doc.data() } as Position;
    const monthlyDividend =
      monthlyDividendByTicker.get(position.ticker.toUpperCase()) ?? 0;
    const quantity = validQuantity(position.quantity);
    const monthlyIncome = roundCurrency(quantity * monthlyDividend);
    const paymentDate = paymentDateByTicker.get(position.ticker.toUpperCase());

    byTicker.push({
      ticker: position.ticker,
      quantity,
      monthlyDividend,
      monthlyIncome,
      ...(paymentDate && { paymentDate }),
    });
    total += monthlyIncome;
  }

  let totalFromFridge = 0;
  for (const item of fridgeItems) {
    const monthlyDividend =
      monthlyDividendByTicker.get(item.ticker.toUpperCase()) ?? 0;
    const quantity = validQuantity(item.quantity);
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
