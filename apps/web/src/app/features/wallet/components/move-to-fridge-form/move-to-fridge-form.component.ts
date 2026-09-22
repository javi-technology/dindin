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
import { Fridge, Position } from 'dindin-models';
import {
  decimalValidator,
  parseDecimal,
} from '../../../../shared/utils/format.util';

export interface MoveToFridgeValue {
  fridgeId: string;
  targetPrice: number;
}

/**
 * Formulário de transferência da carteira para a geladeira (issue #309).
 *
 * Como o formulário de posição, não fala com a API: escolhe o destino e o
 * preço-alvo, valida e emite o payload; o `wallet.component` move e trata a
 * falha.
 */
@Component({
  selector: 'app-move-to-fridge-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './move-to-fridge-form.component.html',
})
export class MoveToFridgeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly position = input.required<Position>();
  readonly fridges = input<Fridge[]>([]);
  /** Falha vinda do pai (API). */
  readonly error = input<string | null>(null);

  readonly confirmed = output<MoveToFridgeValue>();
  readonly closed = output<void>();

  private readonly localError = signal<string | null>(null);
  readonly shownError = computed(() => this.error() ?? this.localError());

  readonly form: FormGroup = this.fb.group({
    fridgeId: ['', [Validators.required]],
    targetPrice: ['0', [Validators.required, decimalValidator()]],
  });

  ngOnInit(): void {
    this.form.reset({
      fridgeId: this.fridges()[0]?.id ?? '',
      targetPrice: '0',
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const fridgeId = this.form.value.fridgeId as string;
    const targetPrice = parseDecimal(this.form.value.targetPrice);

    if (!fridgeId || targetPrice === null || targetPrice < 0) {
      this.localError.set('Preencha todos os campos corretamente.');
      return;
    }

    this.localError.set(null);
    this.confirmed.emit({ fridgeId, targetPrice });
  }

  close(): void {
    this.closed.emit();
  }
}
