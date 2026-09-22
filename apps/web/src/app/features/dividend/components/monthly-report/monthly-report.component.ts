import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MonthlyDividendReport } from '../../../../core/services/dividend.service';
import {
  BarChartComponent,
  BarChartItem,
} from '../../../../shared/components/charts/bar-chart/bar-chart.component';
import {
  formatCurrency,
  formatMonth,
} from '../../../../shared/utils/format.util';

/**
 * Relatório mensal da tela de proventos (issue #311).
 *
 * As séries dos gráficos chegam prontas dos utils compartilhados. A troca de
 * ano é só avisada: quem recarrega o relatório é o `dividend.component`.
 */
@Component({
  selector: 'app-monthly-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent],
  templateUrl: './monthly-report.component.html',
})
export class MonthlyReportComponent {
  readonly report = input<MonthlyDividendReport | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly selectedYear = input(new Date().getFullYear());
  readonly years = input<number[]>([]);
  readonly series = input<BarChartItem[]>([]);
  readonly concentration = input<BarChartItem[]>([]);
  /** Média sobre os meses com provento registrado. */
  readonly monthlyAverage = input(0);

  readonly yearChange = output<Event>();

  formatCurrency = formatCurrency;
  formatMonth = formatMonth;
}
