import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  formatCurrency,
  formatMonth,
  formatPercent,
} from '../../../../shared/utils/format.util';
import { LastMonthSummary } from '../../../../shared/utils/dividend-kpi.util';

/**
 * Indicadores da tela de proventos (issue #311).
 *
 * Só apresenta: os números chegam prontos dos utils compartilhados, que o
 * `dividend.component` já usava.
 */
@Component({
  selector: 'app-dividend-kpis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dividend-kpis.component.html',
})
export class DividendKpisComponent {
  readonly total = input(0);
  readonly totalFromFridge = input(0);
  readonly yearTotal = input(0);
  readonly monthlyAverage = input(0);
  readonly lastMonth = input<LastMonthSummary | null>(null);
  readonly dividendYield = input(0);
  /**
   * Yield zerado com projeção positiva: o aviso explica que o cálculo vem dos
   * proventos registrados, não das cotações.
   */
  readonly yieldNeedsRecords = input(false);
  readonly selectedYear = input(new Date().getFullYear());

  absolute(value: number): number {
    return Math.abs(value);
  }

  formatCurrency = formatCurrency;
  formatPercent = formatPercent;
  formatMonth = formatMonth;
}
