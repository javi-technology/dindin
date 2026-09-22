import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { RecommendedWalletAsset } from 'dindin-models';
import {
  formatCurrency,
  formatPercent,
} from '../../../../shared/utils/format.util';

export type WalletTab = 'renda' | 'ganho';

/**
 * Tabela de ativos da carteira recomendada (issue #310).
 *
 * As abas Renda e Ganho de Capital vieram junto porque só escolhem qual lista
 * a tabela mostra. Qual aba está ativa continua sendo do pai: a comparação e
 * a sugestão do mês também dependem dela.
 */
@Component({
  selector: 'app-recommended-assets-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recommended-assets-table.component.html',
})
export class RecommendedAssetsTableComponent {
  readonly assets = input<RecommendedWalletAsset[]>([]);
  readonly tab = input<WalletTab>('renda');

  readonly tabChange = output<WalletTab>();

  selectTab(tab: WalletTab): void {
    if (tab === this.tab()) return;
    this.tabChange.emit(tab);
  }

  formatCurrency = formatCurrency;

  /**
   * Peso em percentual. A API devolve fração (0.125 para 12,50%) e
   * `formatPercent` espera unidade percentual, daí o `* 100` — sem ele o
   * valor aparece dividido por 100 (issue #360).
   */
  formatWeight(value: number): string {
    return formatPercent(value * 100);
  }
}
