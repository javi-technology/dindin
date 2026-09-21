import { Position } from 'dindin-models';
import type { MonthlyIncomeItem } from 'dindin-shared-types';
import { positionsCollection } from '../firestore/paths';
import { getQuotesByTicker } from '../quotes/quote-prices';
import { roundCurrency, validQuantity } from '../shared/numbers';
import { getAllUserFridgeItems } from '../wallet/fridge-reader';

export type { MonthlyIncomeItem };

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
  const [positionsSnapshot, fridgeItems] = await Promise.all([
    positionsCollection(userId, walletId).get(),
    fetchFridgeItems(userId),
  ]);

  // Só as cotações dos ativos do usuário: varrer `quotes` cobrava uma leitura
  // por ativo do catálogo a cada requisição, e esta rota é chamada uma vez
  // por carteira (issue #299).
  const positions = positionsSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Position,
  );
  const quotes = await getQuotesByTicker([
    ...positions.map((position) => position.ticker),
    ...fridgeItems.map((item) => item.ticker),
  ]);

  const monthlyDividendByTicker = new Map<string, number>();
  const paymentDateByTicker = new Map<string, string>();
  for (const [ticker, data] of quotes) {
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

  for (const position of positions) {
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
