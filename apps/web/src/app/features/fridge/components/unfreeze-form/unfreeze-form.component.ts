import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { FridgeItem, Wallet } from 'dindin-models';

/**
 * Formulário de descongelamento (issue #312).
 *
 * Escolhe a carteira de destino e emite o id. Quem move o item — e trata a
 * falha — é o `fridge.component`.
 */
@Component({
  selector: 'app-unfreeze-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './unfreeze-form.component.html',
})
export class UnfreezeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly item = input.required<FridgeItem>();
  readonly wallets = input<Wallet[]>([]);
  /** Falha vinda do pai (API). */
  readonly error = input<string | null>(null);

  readonly confirmed = output<string>();
  readonly closed = output<void>();

  readonly form: FormGroup = this.fb.group({
    walletId: ['', Validators.required],
  });

  ngOnInit(): void {
    this.form.reset({ walletId: this.wallets()[0]?.id ?? '' });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.confirmed.emit(this.form.value.walletId as string);
  }

  close(): void {
    this.closed.emit();
  }
}
