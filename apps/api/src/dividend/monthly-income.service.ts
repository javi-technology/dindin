import { Position, Quote } from 'dindin-models';
import type { MonthlyIncomeItem } from 'dindin-shared-types';
import { positionsCollection } from '../firestore/paths';
import { getQuotesByTicker } from '../quotes/quote-prices';
import { roundCurrency, validQuantity } from '../shared/numbers';
import { getAllUserFridgeItems } from '../wallet/fridge-reader';
import { getAllUserPositions } from '../wallet/position-reader';

export type { MonthlyIncomeItem };

export interface MonthlyIncome {
  byTicker: MonthlyIncomeItem[];
  total: number;
  totalFromFridge: number;
  monthlyDividendByTicker: Map<string, number>;
}

export const fetchFridgeItems = getAllUserFridgeItems;

/**
 * Núcleo do cálculo: recebe posições e itens **já lidos** e devolve a
 * projeção. Exportado para quem já tem os dados em mãos — o resumo do
 * dashboard lia tudo de novo pelo caminho de conveniência.
 * Posições do mesmo ticker — inclusive em carteiras diferentes — viram uma
 * linha só, somando quantidade e renda (issue #300).
 */
export async function buildMonthlyIncome(
  positions: Position[],
  fridgeItems: { ticker: string; quantity?: unknown }[],
  /** Cotações já lidas, para quem as tem em mãos (ver dashboard). */
  knownQuotes?: Map<string, Quote>,
): Promise<MonthlyIncome> {
  // Só as cotações dos ativos do usuário: varrer `quotes` cobrava uma leitura
  // por ativo do catálogo a cada requisição (issue #299).
  const quotes =
    knownQuotes ??
    (await getQuotesByTicker([
      ...positions.map((position) => position.ticker),
      ...fridgeItems.map((item) => item.ticker),
    ]));

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

  const itemByTicker = new Map<string, MonthlyIncomeItem>();
  let total = 0;

  for (const position of positions) {
    const ticker = position.ticker.toUpperCase();
    const monthlyDividend = monthlyDividendByTicker.get(ticker) ?? 0;
    const quantity = validQuantity(position.quantity);
    const monthlyIncome = roundCurrency(quantity * monthlyDividend);
    const paymentDate = paymentDateByTicker.get(ticker);
    const current = itemByTicker.get(ticker);

    itemByTicker.set(ticker, {
      // O ticker normalizado, e não o do último documento lido: o mesmo ativo
      // pode aparecer com caixa diferente entre carteiras (dado importado), e
      // o front usa este valor para pedir o histórico.
      ticker,
      quantity: (current?.quantity ?? 0) + quantity,
      monthlyDividend,
      monthlyIncome: roundCurrency(
        (current?.monthlyIncome ?? 0) + monthlyIncome,
      ),
      ...(paymentDate && { paymentDate }),
    });
    total += monthlyIncome;
  }

  let totalFromFridge = 0;
  for (const item of fridgeItems) {
    const monthlyDividend =
      monthlyDividendByTicker.get(item.ticker.toUpperCase()) ?? 0;
    totalFromFridge += validQuantity(item.quantity) * monthlyDividend;
  }
  totalFromFridge = roundCurrency(totalFromFridge);
  total = roundCurrency(total + totalFromFridge);

  const byTicker = [...itemByTicker.values()].sort((a, b) =>
    a.ticker.localeCompare(b.ticker),
  );

  return { byTicker, total, totalFromFridge, monthlyDividendByTicker };
}

/** Projeção de renda de uma carteira. */
export async function computeMonthlyIncome(
  userId: string,
  walletId: string,
): Promise<MonthlyIncome> {
  const [positionsSnapshot, fridgeItems] = await Promise.all([
    positionsCollection(userId, walletId).get(),
    fetchFridgeItems(userId),
  ]);

  const positions = positionsSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Position,
  );

  return buildMonthlyIncome(positions, fridgeItems);
}

/**
 * Projeção de renda de **todas** as carteiras do usuário (issue #300).
 *
 * A geladeira é do usuário, não da carteira, então entra uma única vez — era
 * o que o front tentava resolver com `Math.max(totalFromFridge)` sobre as
 * respostas por carteira.
 */
export async function computeConsolidatedMonthlyIncome(
  userId: string,
): Promise<MonthlyIncome> {
  const [positions, fridgeItems] = await Promise.all([
    getAllUserPositions(userId),
    fetchFridgeItems(userId),
  ]);

  return buildMonthlyIncome(positions, fridgeItems);
}
