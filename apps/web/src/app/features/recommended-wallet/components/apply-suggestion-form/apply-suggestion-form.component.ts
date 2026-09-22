import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Asset, AssetType, Position } from 'dindin-models';
import {
  formatCurrency,
  parseDecimal,
} from '../../../../shared/utils/format.util';
import { weightedAveragePrice } from '../../../../shared/utils/position-quantity.util';

/** Compra da sugestão que o usuário está lançando na carteira (#276). */
export interface ApplyTarget {
  ticker: string;
  /** FII de origem, quando a compra é uma alternativa de redistribuição. */
  fallbackFor?: string;
}

export interface ApplySuggestionValue {
  quantity: number;
  price: number;
  assetType: AssetType;
}

/**
 * Formulário de aplicação de uma compra sugerida (issue #310).
 *
 * Carrega a prévia de quantidade e preço médio (#276), que só existe aqui. As
 * posições e o catálogo chegam prontos do pai, que já os buscou ao abrir o
 * modal; este componente não fala com a API.
 */
@Component({
  selector: 'app-apply-suggestion-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apply-suggestion-form.component.html',
})
export class ApplySuggestionFormComponent {
  readonly target = input.required<ApplyTarget>();
  readonly walletName = input('');
  /** `null` enquanto a carteira ainda está sendo carregada. */
  readonly positions = input<Position[] | null>(null);
  readonly assets = input<Asset[]>([]);
  /** Quantidade e preço sugeridos, que o usuário pode ajustar. */
  readonly quantity = input('');
  readonly price = input('');
  readonly error = input<string | null>(null);
  readonly saving = input(false);

  readonly confirmed = output<ApplySuggestionValue>();
  readonly closed = output<void>();

  readonly quantityValue = signal('');
  readonly priceValue = signal('');

  constructor() {
    // O modal é reaproveitado entre itens: cada novo alvo reinicia os campos
    // com o que a IA sugeriu.
    effect(() => {
      this.target();
      this.quantityValue.set(this.quantity());
      this.priceValue.set(this.price());
    });
  }

  readonly existing = computed<Position | null>(() => {
    const positions = this.positions();
    if (!positions) return null;
    const ticker = this.target().ticker.toUpperCase();
    return (
      positions.find((position) => position.ticker.toUpperCase() === ticker) ??
      null
    );
  });

  readonly assetType = computed<AssetType | null>(() => {
    const ticker = this.target().ticker.toUpperCase();
    return (
      this.existing()?.assetType ??
      this.assets().find((asset) => asset.ticker.toUpperCase() === ticker)
        ?.assetType ??
      null
    );
  });

  /** Quantidade e preço médio antes → depois da compra. */
  readonly preview = computed(() => {
    const quantity = parseDecimal(this.quantityValue());
    const price = parseDecimal(this.priceValue());
    if (
      quantity === null ||
      price === null ||
      quantity <= 0 ||
      price <= 0 ||
      this.positions() === null
    ) {
      return null;
    }
    const existing = this.existing();
    return {
      quantity,
      price,
      currentQuantity: existing?.quantity ?? 0,
      newQuantity: (existing?.quantity ?? 0) + quantity,
      currentAverage: existing?.averagePrice ?? null,
      newAverage: existing
        ? weightedAveragePrice(
            existing.quantity,
            existing.averagePrice,
            quantity,
            price,
          )
        : price,
    };
  });

  readonly canConfirm = computed(
    () =>
      this.preview() !== null && this.assetType() !== null && !this.saving(),
  );

  onInput(field: 'quantity' | 'price', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (field === 'quantity' ? this.quantityValue : this.priceValue).set(value);
  }

  confirm(): void {
    const preview = this.preview();
    const assetType = this.assetType();
    if (!preview || !assetType || !this.canConfirm()) return;

    this.confirmed.emit({
      quantity: preview.quantity,
      price: preview.price,
      assetType,
    });
  }

  close(): void {
    // Enquanto a compra é lançada o modal fica aberto: fechar e abrir outro
    // item deixaria a resposta desta chegar no modal errado.
    if (this.saving()) return;
    this.closed.emit();
  }

  formatCurrency = formatCurrency;
}
