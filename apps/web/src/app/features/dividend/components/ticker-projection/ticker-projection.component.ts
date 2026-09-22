import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthlyIncomeItem } from '../../../../core/services/dividend.service';
import { SparklineComponent } from '../../../../shared/components/charts/sparkline/sparkline.component';
import {
  formatCurrency,
  formatDate,
} from '../../../../shared/utils/format.util';
import { DividendTrend } from '../../../../shared/utils/dividend-trend.util';

/** Ativo com seu histórico de provento por cota e a tendência resultante. */
export interface TickerCard {
  item: MonthlyIncomeItem;
  history: number[];
  trend: DividendTrend | null;
}

/**
 * Projeção por ativo da tela de proventos (issue #311).
 *
 * Os cards chegam prontos: histórico e tendência são calculados pelo pai, que
 * é quem busca o histórico de cada ticker.
 */
@Component({
  selector: 'app-ticker-projection',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SparklineComponent],
  templateUrl: './ticker-projection.component.html',
})
export class TickerProjectionComponent {
  readonly cards = input<TickerCard[]>([]);
  /** Ativos omitidos pelo recorte gratuito (#262). */
  readonly hiddenCount = input(0);

  trendSymbol(trend: DividendTrend): string {
    if (trend === 'up') return '▲';
    return trend === 'down' ? '▼' : '=';
  }

  trendLabel(trend: DividendTrend): string {
    if (trend === 'up') return 'Provento por cota subiu';
    return trend === 'down'
      ? 'Provento por cota caiu'
      : 'Provento por cota estável';
  }

  formatCurrency = formatCurrency;
  formatDate = formatDate;
}
