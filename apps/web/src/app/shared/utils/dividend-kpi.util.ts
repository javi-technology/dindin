import {
  DividendYieldResponse,
  MonthlyDividendReport,
} from '../../core/services/dividend.service';

export interface AggregatedDividendYield {
  annualIncome: number;
  currentValue: number;
  /** Dividend yield em pontos percentuais (ex: 9.64 para 9,64%). */
  yield: number;
}

export interface LastMonthSummary {
  month: string;
  total: number;
  /** Variação percentual sobre o mês anterior, ou `null` sem base de comparação. */
  variation: number | null;
}

/** Consolida o dividend yield de várias carteiras em um único indicador. */
export function aggregateDividendYield(
  responses: DividendYieldResponse[],
): AggregatedDividendYield {
  let annualIncome = 0;
  let currentValue = 0;

  for (const response of responses) {
    annualIncome += response.total.annualIncome;
    currentValue += response.total.currentValue;
  }

  return {
    annualIncome,
    currentValue,
    yield: currentValue > 0 ? (annualIncome / currentValue) * 100 : 0,
  };
}

/**
 * Média mensal considerando apenas os meses com provento registrado — meses
 * anteriores ao início do uso do app não puxam a média para baixo.
 */
export function monthlyAverage(report: MonthlyDividendReport | null): number {
  const months = report?.months ?? [];
  return months.length === 0 ? 0 : report!.total / months.length;
}

/** Último mês com provento registrado e sua variação sobre o mês anterior. */
export function lastMonthSummary(
  report: MonthlyDividendReport | null,
): LastMonthSummary | null {
  const months = report?.months ?? [];
  if (months.length === 0) {
    return null;
  }

  const last = months[months.length - 1];
  const previous = months[months.length - 2];

  return {
    month: last.month,
    total: last.total,
    variation:
      previous && previous.total > 0
        ? ((last.total - previous.total) / previous.total) * 100
        : null,
  };
}
