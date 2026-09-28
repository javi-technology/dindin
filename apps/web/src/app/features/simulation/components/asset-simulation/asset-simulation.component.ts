import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  AssetSimulationResponse,
  SimulationMode,
} from 'dindin-shared-types';
import { SimulationResultComponent } from '../simulation-result/simulation-result.component';
import { parseBrlNumber } from '../../../../shared/utils/format.util';
import { LucideCalculator, LucideSparkles } from '@lucide/angular';

export interface AssetSimulationRequestEvent {
  ticker: string;
  amount: string;
  months: number;
  mode: SimulationMode;
}

/**
 * Simulação por ativo (issue #397).
 *
 * Recurso de assinante, ao lado da simulação por carteira, que é gratuita. O
 * selo aparece **antes** do formulário: descobrir que o recurso é pago só
 * depois de preencher ticker, valor e horizonte é o que faz o usuário desistir.
 * Quem não assina é levado ao fluxo de assinatura, não apenas informado.
 */
@Component({
  selector: 'app-asset-simulation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideCalculator,
    LucideSparkles,
    SimulationResultComponent,
  ],
  templateUrl: './asset-simulation.component.html',
})
export class AssetSimulationComponent {
  readonly hasAccess = input(false);
  readonly showPaywall = input(false);
  readonly loading = input(false);
  /** Falha vinda do pai (API). */
  readonly error = input<string | null>(null);
  readonly result = input<AssetSimulationResponse | null>(null);

  readonly simulate = output<AssetSimulationRequestEvent>();
  readonly validationError = output<string>();

  readonly ticker = signal('');
  readonly amount = signal('');
  readonly months = signal('1');
  readonly mode = signal<SimulationMode>('withdraw');
  readonly localError = signal<string | null>(null);

  onTickerInput(event: Event): void {
    this.ticker.set((event.target as HTMLInputElement).value);
  }

  onAmountInput(event: Event): void {
    this.amount.set((event.target as HTMLInputElement).value);
  }

  onMonthsInput(event: Event): void {
    this.months.set((event.target as HTMLInputElement).value);
  }

  selectMode(mode: string): void {
    this.mode.set(mode === 'reinvest' ? 'reinvest' : 'withdraw');
  }

  requestSimulation(): void {
    const ticker = this.ticker().trim().toUpperCase();
    const amount = this.amount().trim();
    const parsed = parseBrlNumber(amount);
    if (ticker === '') {
      this.localError.set('Informe o ticker do ativo.');
      return;
    }
    if (amount === '' || parsed === null || parsed <= 0) {
      this.localError.set('Informe um valor a investir válido.');
      return;
    }

    const months = Number(this.months());
    if (!Number.isInteger(months) || months < 1) {
      this.localError.set('Informe um horizonte em meses válido.');
      return;
    }

    this.localError.set(null);
    this.simulate.emit({ ticker, amount, months, mode: this.mode() });
  }
}
