import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
  Wallet,
} from 'dindin-models';
import {
  formatCurrency,
  formatPercent,
} from '../../../../shared/utils/format.util';

/**
 * Comparação da carteira recomendada com a do usuário (issue #310).
 *
 * A comparação chega pronta da API: aqui ela só é exibida. A carteira
 * escolhida continua no pai, que é quem dispara a requisição ao trocar.
 */
@Component({
  selector: 'app-wallet-comparison',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wallet-comparison.component.html',
})
export class WalletComparisonComponent {
  readonly wallets = input<Wallet[]>([]);
  readonly selectedWalletId = input<string | null>(null);
  /** `null` enquanto a comparação ainda não foi carregada. */
  readonly comparison = input<RecommendedWalletComparison | null>(null);

  readonly walletChange = output<string>();

  onWalletChange(event: Event): void {
    this.walletChange.emit((event.target as HTMLSelectElement).value);
  }

  statusLabel(status: RecommendedWalletComparisonItem['status']): string {
    if (status === 'match') return 'Recomendado e possuído';
    if (status === 'missing') return 'Falta comprar';
    return 'Fora da recomendação';
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
