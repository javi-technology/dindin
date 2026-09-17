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
  // `months` é esparso — só traz meses com provento. Comparar com o item
  // anterior da lista compararia junho com janeiro e chamaria isso de
  // "mês anterior", então a busca é pelo mês de calendário anterior.
  const previous = months.find(
    (month) => month.month === previousMonthOf(last.month),
  );

  return {
    month: last.month,
    total: last.total,
    variation:
      previous && previous.total > 0
        ? ((last.total - previous.total) / previous.total) * 100
        : null,
  };
}

/** Mês de calendário anterior a `YYYY-MM`, virando o ano quando preciso. */
function previousMonthOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNumber - 1).padStart(2, '0')}`;
}
