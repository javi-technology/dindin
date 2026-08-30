import {
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Consolida as respostas de `monthly-income` de várias carteiras.
 * A geladeira é retornada por inteiro em cada carteira, então entra uma única vez.
 */
export function aggregateMonthlyIncome(
  responses: MonthlyIncomeResponse[],
): MonthlyIncomeResponse {
  const byTicker = new Map<string, MonthlyIncomeItem>();
  let fromPositions = 0;

  for (const response of responses) {
    fromPositions += response.total - response.totalFromFridge;

    for (const item of response.byTicker) {
      const current = byTicker.get(item.ticker);
      byTicker.set(
        item.ticker,
        current
          ? {
              ...current,
              quantity: current.quantity + item.quantity,
              monthlyIncome: round(current.monthlyIncome + item.monthlyIncome),
            }
          : { ...item },
      );
    }
  }

  const totalFromFridge =
    responses.length === 0
      ? 0
      : Math.max(...responses.map((response) => response.totalFromFridge));

  return {
    byTicker: Array.from(byTicker.values()),
    total: round(fromPositions + totalFromFridge),
    totalFromFridge,
  };
}
