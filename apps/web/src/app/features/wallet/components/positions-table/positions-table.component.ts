import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Position } from 'dindin-models';
import {
  DividendYieldResponse,
  MonthlyIncomeResponse,
} from '../../../../core/services/dividend.service';
import {
  formatCurrency,
  formatPercent,
} from '../../../../shared/utils/format.util';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideArrowUpDown,
  LucidePencil,
  LucideRefrigerator,
  LucideTrash2,
} from '@lucide/angular';

export type PositionSortColumn =
  | 'ticker'
  | 'quantity'
  | 'currentPrice'
  | 'total'
  | 'monthlyIncome'
  | 'dividendYield';

export interface PositionSort {
  column: PositionSortColumn;
  direction: 'asc' | 'desc';
}

const tickerCollator = new Intl.Collator('pt-BR');

/**
 * Tabela de posições da carteira (issue #309).
 *
 * A ordenação (#274) e os totais do rodapé moram aqui porque só existem por
 * causa da tabela: o `wallet.component` ficou com a orquestração e não precisa
 * saber por qual coluna a tela está ordenada.
 *
 * Os agregados chegam prontos da API, em vez de serem recalculados a partir
 * das posições, porque o recorte gratuito (#262) omite ativos e o total do
 * servidor é o número certo mesmo quando a lista está incompleta.
 */
@Component({
  selector: 'app-positions-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideArrowUp,
    LucideArrowDown,
    LucideArrowUpDown,
    LucidePencil,
    LucideRefrigerator,
    LucideTrash2,
  ],
  templateUrl: './positions-table.component.html',
})
export class PositionsTableComponent {
  readonly positions = input.required<Position[]>();
  readonly dividendYield = input<DividendYieldResponse | null>(null);
  readonly monthlyIncome = input<MonthlyIncomeResponse | null>(null);

  readonly edit = output<Position>();
  readonly moveToFridge = output<Position>();
  readonly remove = output<Position>();

  /** Coluna e direção da tabela de posições (#274). */
  readonly sort = signal<PositionSort>({ column: 'ticker', direction: 'asc' });

  readonly sortableColumns: {
    column: PositionSortColumn;
    label: string;
  }[] = [
    { column: 'ticker', label: 'Ticker' },
    { column: 'quantity', label: 'Quantidade' },
    { column: 'currentPrice', label: 'Preço atual' },
    { column: 'total', label: 'Total' },
    { column: 'monthlyIncome', label: 'Proventos/mês' },
    { column: 'dividendYield', label: 'DY' },
  ];

  /** Retorna o preço unitário atual (mercado) ou o preço médio como fallback. */
  unitPrice = (position: Position): number =>
    position.currentPrice ?? position.averagePrice;

  /** Retorna o valor total da posição (quantidade × preço unitário atual). */
  totalPosition = (position: Position): number =>
    position.quantity * this.unitPrice(position);

  readonly totalGeral = computed(() =>
    this.positions().reduce(
      (sum, position) => sum + this.totalPosition(position),
      0,
    ),
  );

  readonly totalDividendYield = computed(
    () => this.dividendYield()?.total?.yield ?? 0,
  );

  readonly totalProventos = computed(() => this.monthlyIncome()?.total ?? 0);
  readonly totalProventosFromFridge = computed(
    () => this.monthlyIncome()?.totalFromFridge ?? 0,
  );

  dividendYieldFor = (position: Position): number => {
    const found = this.dividendYield()?.byTicker.find(
      (item) => item.ticker === position.ticker,
    );
    return found?.yield ?? 0;
  };

  /**
   * `null` quando a projeção do ativo ficou de fora do recorte gratuito
   * (#262): exibir R$ 0,00 nesse caso seria número errado, não bloqueio.
   */
  totalProventosFor = (position: Position): number | null => {
    const income = this.monthlyIncome();
    const found = income?.byTicker.find(
      (item) => item.ticker === position.ticker,
    );
    if (found) return found.monthlyIncome;
    return income?.limited ? null : 0;
  };

  /**
   * Posições na ordem escolhida. Quem não tem valor na coluna (projeção
   * bloqueada no plano gratuito) vai para o fim nas duas direções, e empates
   * seguem o Ticker A→Z para a ordem não oscilar.
   */
  readonly sortedPositions = computed(() => {
    const { column, direction } = this.sort();
    const factor = direction === 'asc' ? 1 : -1;
    const byTicker = (a: Position, b: Position) =>
      tickerCollator.compare(a.ticker, b.ticker);

    return this.positions()
      .map((position) => ({
        position,
        value: this.sortValue(position, column),
      }))
      .sort((a, b) => {
        if (column === 'ticker') {
          return factor * byTicker(a.position, b.position);
        }
        if (a.value === null || b.value === null) {
          if (a.value !== b.value) return a.value === null ? 1 : -1;
          return byTicker(a.position, b.position);
        }
        return factor * (a.value - b.value) || byTicker(a.position, b.position);
      })
      .map(({ position }) => position);
  });

  toggleSort(column: PositionSortColumn): void {
    this.sort.update((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    );
  }

  ariaSort(column: PositionSortColumn): 'ascending' | 'descending' | 'none' {
    const { column: active, direction } = this.sort();
    if (active !== column) return 'none';
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  private sortValue(
    position: Position,
    column: PositionSortColumn,
  ): number | null {
    switch (column) {
      case 'quantity':
        return position.quantity;
      // Os mesmos valores da tabela: sem cotação, vale o preço médio.
      case 'currentPrice':
        return this.unitPrice(position);
      case 'total':
        return this.totalPosition(position);
      case 'monthlyIncome':
        return this.totalProventosFor(position);
      case 'dividendYield':
        return this.dividendYieldFor(position);
      default:
        return null;
    }
  }

  formatCurrency = formatCurrency;
  formatPercent = formatPercent;
}
