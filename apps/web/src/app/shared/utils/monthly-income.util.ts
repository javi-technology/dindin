import {
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Junta o mesmo ticker vindo de carteiras diferentes somando quantidade e
 * renda. Usado tanto na agregação das carteiras quanto no recorte gratuito.
 */
export function mergeMonthlyIncomeItems(
  items: MonthlyIncomeItem[],
): MonthlyIncomeItem[] {
  const byTicker = new Map<string, MonthlyIncomeItem>();

  for (const item of items) {
    const current = byTicker.get(item.ticker);
    byTicker.set(
      item.ticker,
      current
        ? {
            ...current,
            ...(!current.paymentDate &&
              item.paymentDate && { paymentDate: item.paymentDate }),
            quantity: current.quantity + item.quantity,
            monthlyIncome: round(current.monthlyIncome + item.monthlyIncome),
          }
        : { ...item },
    );
  }

  return Array.from(byTicker.values());
}

/**
 * Consolida as respostas de `monthly-income` de várias carteiras.
 * A geladeira é retornada por inteiro em cada carteira, então entra uma única vez.
 */
export function aggregateMonthlyIncome(
  responses: MonthlyIncomeResponse[],
): MonthlyIncomeResponse {
  let fromPositions = 0;
  for (const response of responses) {
    fromPositions += response.total - response.totalFromFridge;
  }

  const totalFromFridge =
    responses.length === 0
      ? 0
      : Math.max(...responses.map((response) => response.totalFromFridge));

  return {
    byTicker: mergeMonthlyIncomeItems(
      responses.flatMap((response) => response.byTicker),
    ),
    total: round(fromPositions + totalFromFridge),
    totalFromFridge,
  };
}
