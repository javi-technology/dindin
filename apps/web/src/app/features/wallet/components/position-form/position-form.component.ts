import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { merge } from 'rxjs';
import { Asset, AssetType, Position } from 'dindin-models';
import {
  decimalValidator,
  parseDecimal,
} from '../../../../shared/utils/format.util';
import {
  resolveQuantity,
  weightedAveragePrice,
} from '../../../../shared/utils/position-quantity.util';

export interface PositionFormValue {
  ticker: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
}

/**
 * Formulário de posição da carteira (issue #309).
 *
 * Carrega a variação de quantidade (`+N`/`-N`, #215) e o recálculo do preço
 * médio ponderado, que só dizem respeito a este formulário. O componente não
 * fala com a API: valida, resolve a quantidade e emite o payload pronto; o
 * `wallet.component` decide se é criação ou edição e trata a falha.
 */
@Component({
  selector: 'app-position-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './position-form.component.html',
})
export class PositionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Posição em edição, ou `null` ao adicionar. */
  readonly position = input<Position | null>(null);
  readonly assets = input<Asset[]>([]);
  readonly assetsError = input<string | null>(null);
  /** Falha vinda do pai (API ou carteira ausente). */
  readonly error = input<string | null>(null);

  readonly save = output<PositionFormValue>();
  readonly closed = output<void>();

  /** Campos obrigatórios incompletos: erro do próprio formulário. */
  private readonly localError = signal<string | null>(null);
  readonly shownError = computed(() => this.error() ?? this.localError());

  /** Quantidade e preço médio da posição ao abrir o formulário. */
  private originalQuantity = 0;
  private originalAveragePrice = '0';
  private averagePriceRecalculated = false;

  readonly form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    assetType: ['FII', [Validators.required]],
    quantity: ['0', [Validators.required, this.quantityValidator()]],
    averagePrice: ['0', [Validators.required, decimalValidator()]],
    purchasePrice: ['', [decimalValidator()]],
  });

  ngOnInit(): void {
    const position = this.position();
    this.originalQuantity = position?.quantity ?? 0;
    this.originalAveragePrice = String(position?.averagePrice ?? 0);
    this.averagePriceRecalculated = false;

    this.form.reset({
      ticker: position?.ticker ?? '',
      assetType: position?.assetType ?? 'FII',
      purchasePrice: '',
      quantity: String(this.originalQuantity),
      averagePrice: this.originalAveragePrice,
    });

    merge(
      this.form.controls['quantity'].valueChanges,
      this.form.controls['purchasePrice'].valueChanges,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.quantityValue.set(this.quantityText());
        this.syncAveragePrice();
      });

    this.quantityValue.set(this.quantityText());
  }

  /**
   * Quantidade digitada, espelhada em signal. O que o template deriva dela
   * precisa acompanhar mudanças programáticas do form, que com `OnPush` não
   * disparam detecção de mudança sozinhas.
   */
  private readonly quantityValue = signal('0');

  /** Indica se a quantidade digitada é uma compra (`+N`). */
  readonly isAddingQuantity = computed(() =>
    this.quantityValue().startsWith('+'),
  );

  /** Total resultante quando a quantidade é informada como variação. */
  readonly quantityPreview = computed(() => {
    const text = this.quantityValue();
    if (!/^[+-]/.test(text)) return null;
    const resolved = resolveQuantity(text, this.originalQuantity);
    return resolved
      ? `Total: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(resolved.quantity)}`
      : null;
  });

  private quantityText(): string {
    return String(this.form.controls['quantity'].value ?? '').trim();
  }

  private quantityValidator(): ValidatorFn {
    return (control) =>
      resolveQuantity(control.value, this.originalQuantity)
        ? null
        : { invalidQuantity: true };
  }

  /** Recalcula o preço médio em compras (`+N`) com preço da compra informado. */
  private syncAveragePrice(): void {
    const purchasePriceControl = this.form.controls['purchasePrice'];
    const averagePriceControl = this.form.controls['averagePrice'];

    if (!this.quantityText().startsWith('+') && purchasePriceControl.value) {
      purchasePriceControl.setValue('', { emitEvent: false });
    }

    const resolved = resolveQuantity(
      this.quantityText(),
      this.originalQuantity,
    );
    const purchasePrice = parseDecimal(purchasePriceControl.value);

    if (
      resolved?.mode === 'add' &&
      purchasePrice !== null &&
      purchasePrice >= 0
    ) {
      const averagePrice = weightedAveragePrice(
        this.originalQuantity,
        parseDecimal(this.originalAveragePrice) ?? 0,
        resolved.quantity - this.originalQuantity,
        purchasePrice,
      );
      averagePriceControl.setValue(averagePrice.toFixed(2));
      this.averagePriceRecalculated = true;
    } else if (this.averagePriceRecalculated) {
      averagePriceControl.setValue(this.originalAveragePrice);
      this.averagePriceRecalculated = false;
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const ticker = this.form.value.ticker as string;
    const quantity = resolveQuantity(
      this.form.value.quantity,
      this.originalQuantity,
    )?.quantity;
    const averagePrice = parseDecimal(this.form.value.averagePrice);

    if (
      !ticker ||
      quantity === undefined ||
      averagePrice === null ||
      averagePrice < 0
    ) {
      this.localError.set(
        'Preencha todos os campos obrigatórios corretamente.',
      );
      this.form.markAllAsTouched();
      return;
    }

    this.localError.set(null);
    this.save.emit({
      ticker: ticker.trim().toUpperCase(),
      assetType: this.form.value.assetType,
      quantity,
      averagePrice,
    });
  }

  close(): void {
    this.closed.emit();
  }
}
