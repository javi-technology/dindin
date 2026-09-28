import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { SimulationItem, SimulationResult } from 'dindin-shared-types';
import { formatCurrency } from '../../../../shared/utils/format.util';
import { LucideTriangleAlert } from '@lucide/angular';

/**
 * Resultado da simulação (issue #396).
 *
 * Exibe o que a API devolveu, sem recalcular nada: a projeção, o detalhe por
 * ativo, as cotas e o troco. A premissa fica na tela junto do número — uma
 * projeção sem a ressalva de que repete o último provento real passa por
 * promessa de rentabilidade.
 */
@Component({
  selector: 'app-simulation-result',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideTriangleAlert],
  templateUrl: './simulation-result.component.html',
})
export class SimulationResultComponent {
  // O tipo é o resultado base: a mesma exibição serve à simulação por carteira
  // e à por ativo (#397), que só acrescentam o contexto de onde ela veio.
  readonly result = input.required<SimulationResult>();

  readonly reinvesting = computed(() => this.result().mode === 'reinvest');
  readonly horizonLabel = computed(() => {
    const months = this.result().months;
    return months === 1 ? '1 mês' : `${months} meses`;
  });

  quantityLabel(quantity: number): string {
    return quantity === 1 ? 'cota' : 'cotas';
  }

  itemWarning(item: SimulationItem): string | null {
    if (item.missingPrice) return 'Sem cotação: ficou fora da alocação';
    if (item.missingDividend) return 'Sem provento conhecido';
    if (item.staleDividend) return 'Último provento desatualizado';
    return null;
  }

  formatCurrency = formatCurrency;
}
