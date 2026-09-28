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
import { EMPTY, Subject, catchError, of, switchMap } from 'rxjs';
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

  /**
   * Parâmetros da simulação pedida; `null` quando não há pedido em pé.
   *
   * O `switchMap` descarta a resposta do pedido anterior assim que outro
   * chega, então duas simulações disparadas em sequência não podem se
   * atropelar na tela.
   */
  private readonly walletRequest =
    new Subject<WalletSimulationRequest | null>();

  constructor() {
    this.walletRequest
      .pipe(
        switchMap((request) =>
          request === null
            ? EMPTY
            : this.simulationService.simulateWallet(request).pipe(
                // O erro é tratado aqui dentro para não encerrar o fluxo: uma
                // falha não pode impedir a próxima simulação.
                catchError((failure: { error?: { error?: string } }) =>
                  of({
                    error:
                      failure?.error?.error ??
                      'Não foi possível simular. Tente novamente.',
                  }),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        if ('error' in outcome) {
          this.result.set(null);
          this.error.set(outcome.error);
          return;
        }
        this.result.set(outcome);
      });
  }

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
    this.discardResult();
  }

  selectMonth(month: string): void {
    this.selectedMonth.set(month || null);
    this.discardResult();
  }

  selectTab(tab: string): void {
    this.selectedTab.set(tab === 'ganho' ? 'ganho' : 'renda');
    this.discardResult();
  }

  selectMode(mode: string): void {
    this.mode.set(mode === 'reinvest' ? 'reinvest' : 'withdraw');
    this.discardResult();
  }

  onAmountInput(event: Event): void {
    this.amount.set((event.target as HTMLInputElement).value);
    this.discardResult();
  }

  onMonthsInput(event: Event): void {
    this.months.set((event.target as HTMLInputElement).value);
    this.discardResult();
  }

  /**
   * O resultado vale para os parâmetros que o geraram: mudou um deles, o que
   * está na tela deixou de valer. Emitir `null` desfaz também a requisição em
   * voo — sem isso, a resposta antiga chegaria depois e preencheria a tela com
   * a simulação dos filtros anteriores.
   */
  private discardResult(): void {
    this.result.set(null);
    this.loading.set(false);
    this.walletRequest.next(null);
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
    this.walletRequest.next({
      amount: raw,
      months,
      mode: this.mode(),
      ...(provider ? { provider } : {}),
      ...(month ? { month } : {}),
      tab: this.selectedTab(),
    });
  }
}
