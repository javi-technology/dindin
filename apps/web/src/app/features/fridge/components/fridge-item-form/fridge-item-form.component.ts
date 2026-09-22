import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Asset, FridgeItem } from 'dindin-models';
import {
  decimalValidator,
  parseDecimal,
} from '../../../../shared/utils/format.util';

export interface FridgeItemFormValue {
  ticker: string;
  quantity: number;
  transferredPrice: number;
  targetPrice: number;
}

/**
 * Formulário de item da geladeira (issue #312).
 *
 * O payload é montado uma única vez: no `fridge.component` o mesmo objeto era
 * construído nos ramos de criação e de edição do `save()`. Aqui ele sai
 * pronto e o pai só decide qual rota chamar.
 */
@Component({
  selector: 'app-fridge-item-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './fridge-item-form.component.html',
})
export class FridgeItemFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  /** Item em edição, ou `null` ao adicionar. */
  readonly item = input<FridgeItem | null>(null);
  readonly assets = input<Asset[]>([]);
  readonly assetsError = input<string | null>(null);
  /** Falha vinda do pai (API ou geladeira ausente). */
  readonly error = input<string | null>(null);

  readonly save = output<FridgeItemFormValue>();
  readonly closed = output<void>();

  /** Campos obrigatórios incompletos: erro do próprio formulário. */
  private readonly localError = signal<string | null>(null);
  readonly shownError = computed(() => this.error() ?? this.localError());

  readonly form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    quantity: [0, [Validators.required, Validators.min(0.0001)]],
    transferredPrice: ['0', [Validators.required, decimalValidator()]],
    targetPrice: ['0', [Validators.required, decimalValidator()]],
  });

  ngOnInit(): void {
    const item = this.item();
    this.form.reset({
      ticker: item?.ticker ?? '',
      quantity: item?.quantity ?? 0,
      transferredPrice: String(item?.transferredPrice ?? 0),
      targetPrice: String(item?.targetPrice ?? 0),
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const ticker = this.form.value.ticker as string;
    const quantity = Number(this.form.value.quantity);
    const transferredPrice = parseDecimal(this.form.value.transferredPrice);
    const targetPrice = parseDecimal(this.form.value.targetPrice);

    if (
      !ticker ||
      Number.isNaN(quantity) ||
      quantity <= 0 ||
      transferredPrice === null ||
      transferredPrice < 0 ||
      targetPrice === null ||
      targetPrice < 0
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
      quantity,
      transferredPrice,
      targetPrice,
    });
  }

  close(): void {
    this.closed.emit();
  }
}
