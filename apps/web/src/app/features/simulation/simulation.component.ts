import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { AiSuggestionTab } from 'dindin-models';
import type {
  SimulationMode,
  SimulationWalletOption,
  WalletSimulationResponse,
} from 'dindin-shared-types';
import { SimulationService } from '../../core/services/simulation.service';
import { SimulationResultComponent } from './components/simulation-result/simulation-result.component';
import { parseBrlNumber } from '../../shared/utils/format.util';
import { LucideArrowLeft, LucideCalculator } from '@lucide/angular';

/**
 * Tela de simulação de investimento (issue #396).
 *
 * A simulação por carteira sugerida é gratuita: a tela não consulta assinatura
 * para liberar o formulário. A carteira é escolhida pelo usuário, e não fixada
 * na do BB, porque está previsto haver mais de uma.
 */
@Component({
  selector: 'app-simulation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideCalculator,
    SimulationResultComponent,
  ],
  templateUrl: './simulation.component.html',
})
export class SimulationComponent implements OnInit {
  private readonly simulationService = inject(SimulationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly wallets = signal<SimulationWalletOption[]>([]);
  readonly selectedProvider = signal<string | null>(null);
  readonly selectedMonth = signal<string | null>(null);
  readonly selectedTab = signal<AiSuggestionTab>('renda');
  readonly amount = signal('');
  readonly months = signal('1');
  readonly mode = signal<SimulationMode>('withdraw');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<WalletSimulationResponse | null>(null);

  readonly selectedWallet = computed(
    () =>
      this.wallets().find(
        (wallet) => wallet.slug === this.selectedProvider(),
      ) ?? null,
  );
  readonly availableMonths = computed(
    () => this.selectedWallet()?.months ?? [],
  );

  ngOnInit(): void {
    this.simulationService
      .listWallets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wallets) => {
          this.wallets.set(wallets);
          this.selectProvider(wallets[0]?.slug ?? '');
        },
        error: () =>
          this.error.set('Não foi possível carregar as carteiras sugeridas.'),
      });
  }

  selectProvider(slug: string): void {
    this.selectedProvider.set(slug || null);
    this.selectedMonth.set(this.availableMonths()[0] ?? null);
    this.result.set(null);
  }

  selectMonth(month: string): void {
    this.selectedMonth.set(month || null);
    this.result.set(null);
  }

  selectTab(tab: string): void {
    this.selectedTab.set(tab === 'ganho' ? 'ganho' : 'renda');
    this.result.set(null);
  }

  selectMode(mode: string): void {
    this.mode.set(mode === 'reinvest' ? 'reinvest' : 'withdraw');
  }

  onAmountInput(event: Event): void {
    this.amount.set((event.target as HTMLInputElement).value);
  }

  onMonthsInput(event: Event): void {
    this.months.set((event.target as HTMLInputElement).value);
  }

  simulate(): void {
    const raw = this.amount().trim();
    const amount = parseBrlNumber(raw);
    // O formato do campo é validado aqui, onde é digitado; a faixa aceita e a
    // conversão definitiva ficam na API, para não existirem em duas versões.
    if (raw === '' || amount === null || amount <= 0) {
      this.error.set('Informe um valor a investir válido.');
      this.result.set(null);
      return;
    }

    const months = Number(this.months());
    if (!Number.isInteger(months) || months < 1) {
      this.error.set('Informe um horizonte em meses válido.');
      this.result.set(null);
      return;
    }

    const provider = this.selectedProvider();
    const month = this.selectedMonth();
    this.error.set(null);
    this.loading.set(true);
    this.simulationService
      .simulateWallet({
        amount: raw,
        months,
        mode: this.mode(),
        ...(provider ? { provider } : {}),
        ...(month ? { month } : {}),
        tab: this.selectedTab(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (failure: { error?: { error?: string } }) => {
          this.loading.set(false);
          this.result.set(null);
          this.error.set(
            failure?.error?.error ??
              'Não foi possível simular. Tente novamente.',
          );
        },
      });
  }
}
