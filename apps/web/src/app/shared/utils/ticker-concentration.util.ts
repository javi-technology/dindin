import { MonthlyDividendReport } from '../../core/services/dividend.service';
import { BarChartItem } from '../components/charts/bar-chart/bar-chart.component';
import { formatCurrency } from './format.util';

const MAX_ITEMS = 8;
const OTHERS_LABEL = 'Outros';

function formatShare(value: number, total: number): string {
  const share = total > 0 ? (value / total) * 100 : 0;
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(share);
  return `${formatCurrency(value)} · ${formatted}%`;
}

/**
 * Ordena os tickers pelo total recebido no ano e agrupa o excedente em
 * "Outros", para que a concentração da renda fique visível sem uma barra
 * por ativo.
 */
export function buildTickerConcentration(
  report: MonthlyDividendReport | null,
): BarChartItem[] {
  const sorted = (report?.byTicker ?? [])
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);

  if (sorted.length === 0) {
    return [];
  }

  const total = sorted.reduce((sum, item) => sum + item.total, 0);

  const entries =
    sorted.length > MAX_ITEMS
      ? [
          ...sorted.slice(0, MAX_ITEMS - 1),
          {
            ticker: OTHERS_LABEL,
            total: sorted
              .slice(MAX_ITEMS - 1)
              .reduce((sum, item) => sum + item.total, 0),
          },
        ]
      : sorted;

  return entries.map((item) => ({
    label: item.ticker,
    value: item.total,
    valueLabel: formatShare(item.total, total),
  }));
}
