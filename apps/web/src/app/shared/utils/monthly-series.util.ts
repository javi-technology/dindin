import { MonthlyDividendReport } from '../../core/services/dividend.service';
import { BarChartItem } from '../components/charts/bar-chart/bar-chart.component';

const MONTH_LABELS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/**
 * Monta os 12 meses do ano para o gráfico de barras: meses sem provento
 * aparecem zerados (e não somem do eixo) e o mês corrente é destacado
 * apenas quando o ano exibido é o ano atual.
 */
export function buildMonthlySeries(
  report: MonthlyDividendReport | null,
  year: number,
  today: Date = new Date(),
): BarChartItem[] {
  const totals = new Map<number, number>();

  for (const month of report?.months ?? []) {
    if (Number(month.month.slice(0, 4)) !== year) {
      continue;
    }
    const index = Number(month.month.slice(5, 7)) - 1;
    if (index >= 0 && index < MONTH_LABELS.length) {
      totals.set(index, (totals.get(index) ?? 0) + month.total);
    }
  }

  const currentMonth =
    today.getFullYear() === year ? today.getMonth() : undefined;

  return MONTH_LABELS.map((label, index) => ({
    label,
    value: totals.get(index) ?? 0,
    highlight: index === currentMonth,
  }));
}
