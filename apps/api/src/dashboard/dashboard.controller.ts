import { Request, Response } from 'express';
import type {
  DashboardSummaryResponse,
  TickerValue,
} from 'dindin-shared-types';
import { uid } from '../firestore/paths';
import { asyncHandler } from '../middleware/async-handler';
import { buildMonthlyIncome } from '../dividend/monthly-income.service';
import { getQuotesByTicker } from '../quotes/quote-prices';
import { roundCurrency, validPrice, validQuantity } from '../shared/numbers';
import { getAllUserFridgeItems } from '../wallet/fridge-reader';
import { getAllUserPositions } from '../wallet/position-reader';

/**
 * Resumo do dashboard numa requisição só (issue #300).
 *
 * A tela montava esses números com uma requisição de posições por carteira,
 * uma de itens por geladeira e uma de renda mensal por carteira — e ainda
 * recalculava patrimônio e composição no cliente, apesar de o backend já ter
 * a mesma matemática. Com muitas carteiras, o volume chegava perto do rate
 * limit de 100 req/min.
 */
export const getDashboardSummary = asyncHandler(
  'getDashboardSummary',
  async (req: Request, res: Response) => {
    const userId = uid(req);

    // Uma leitura de cada coisa: posições, itens e cotações são
    // compartilhadas entre o patrimônio e a projeção de renda. Chamar
    // `computeConsolidatedMonthlyIncome` aqui releria tudo.
    const [positions, fridgeItems] = await Promise.all([
      getAllUserPositions(userId),
      getAllUserFridgeItems(userId),
    ]);

    const quotes = await getQuotesByTicker([
      ...positions.map((position) => position.ticker),
      ...fridgeItems.map((item) => item.ticker),
    ]);

    const income = await buildMonthlyIncome(positions, fridgeItems, quotes);

    const priceOf = (ticker: string, fallback: unknown): number =>
      validPrice(quotes.get(ticker.toUpperCase())?.price) ??
      validPrice(fallback) ??
      0;

    // A composição some o mesmo ticker de carteiras diferentes, como o
    // gráfico já fazia na tela.
    const valueByTicker = new Map<string, number>();
    let totalWallet = 0;
    for (const position of positions) {
      const value =
        validQuantity(position.quantity) *
        priceOf(position.ticker, position.averagePrice);
      if (value <= 0) continue;

      totalWallet += value;
      const ticker = position.ticker.toUpperCase();
      valueByTicker.set(ticker, (valueByTicker.get(ticker) ?? 0) + value);
    }

    let totalFridge = 0;
    for (const item of fridgeItems) {
      totalFridge +=
        validQuantity(item.quantity) *
        priceOf(item.ticker, item.transferredPrice);
    }

    const composition: TickerValue[] = [...valueByTicker.entries()]
      .map(([ticker, value]) => ({ ticker, value: roundCurrency(value) }))
      .sort((a, b) => b.value - a.value);

    totalWallet = roundCurrency(totalWallet);
    totalFridge = roundCurrency(totalFridge);

    const body: DashboardSummaryResponse = {
      totalWallet,
      totalFridge,
      total: roundCurrency(totalWallet + totalFridge),
      monthlyIncomeTotal: income.total,
      composition,
    };

    res.json(body);
  },
);
