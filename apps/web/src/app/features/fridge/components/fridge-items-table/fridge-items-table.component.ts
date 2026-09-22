import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FridgeItem } from 'dindin-models';
import { formatCurrency } from '../../../../shared/utils/format.util';
import { LucideFlame, LucidePencil, LucideTrash2 } from '@lucide/angular';

/**
 * Tabela de itens da geladeira (issue #312).
 *
 * O potencial de ganho mora aqui porque só existe por causa da coluna. Quem
 * fala com a API continua sendo o `fridge.component`.
 */
@Component({
  selector: 'app-fridge-items-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideFlame, LucidePencil, LucideTrash2],
  templateUrl: './fridge-items-table.component.html',
})
export class FridgeItemsTableComponent {
  readonly items = input<FridgeItem[]>([]);

  readonly unfreeze = output<FridgeItem>();
  readonly edit = output<FridgeItem>();
  readonly remove = output<FridgeItem>();

  /** Potencial de ganho em percentual, ou null se não houver base. */
  potentialGain(item: FridgeItem): number | null {
    if (!item.targetPrice) return null;
    const base = item.currentPrice ?? item.transferredPrice;
    if (!base || base === 0) return null;
    return ((item.targetPrice - base) / base) * 100;
  }

  formatPotential(item: FridgeItem): string {
    const gain = this.potentialGain(item);
    if (gain === null) return '—';
    const formatted = gain.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted}%`;
  }

  formatCurrency = formatCurrency;
}
