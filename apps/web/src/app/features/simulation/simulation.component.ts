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
  AssetSimulationResponse,
  SimulationMode,
  SimulationWalletOption,
  WalletSimulationRequest,
  WalletSimulationResponse,
} from 'dindin-shared-types';
import { SimulationService } from '../../core/services/simulation.service';
import { BillingService } from '../../core/services/billing.service';
import { SimulationResultComponent } from './components/simulation-result/simulation-result.component';
import {
  AssetSimulationComponent,
  AssetSimulationRequestEvent,
} from './components/asset-simulation/asset-simulation.component';
import { parseBrlNumber } from '../../shared/utils/format.util';
import { LucideArrowLeft, LucideCalculator } from '@lucide/angular';

/**
 * Tela de simulação de investimento (issue #396).
 *
 * A simulação por carteira sugerida é gratuita: a tela não consulta assinatura
 * para liberar o formulário. A carteira é escolhida pelo usuário, e não fixada
 * na do BB, porque está previsto haver mais de uma.
 *
 * A simulação por ativo, ao lado, é de assinante (#397) e tem gate próprio: o
 * bloqueio de uma não pode alcançar a outra.
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
    AssetSimulationComponent,
  ],
  templateUrl: './simulation.component.html',
})
export class SimulationComponent implements OnInit {
  private readonly simulationService = inject(SimulationService);
  private readonly billingService = inject(BillingService);
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

  /** O mesmo, para a simulação por ativo. */
  private readonly assetRequest =
    new Subject<AssetSimulationRequestEvent | null>();

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

    this.assetRequest
      .pipe(
        switchMap((request) =>
          request === null
            ? EMPTY
            : this.simulationService.simulateAsset(request).pipe(
                catchError(
                  (failure: { status?: number; error?: { error?: string } }) =>
                    of({
                      // O 403 já vira paywall pelo interceptor; repetir a
                      // mensagem aqui só empilharia dois avisos do mesmo
                      // bloqueio.
                      error:
                        failure?.status === 403
                          ? null
                          : (failure?.error?.error ??
                            'Não foi possível simular o ativo. Tente novamente.'),
                    }),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.assetLoading.set(false);
        if ('error' in outcome) {
          this.assetResult.set(null);
          this.assetError.set(outcome.error);
          return;
        }
        this.assetResult.set(outcome);
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

  readonly assetResult = signal<AssetSimulationResponse | null>(null);
  readonly assetLoading = signal(false);
  readonly assetError = signal<string | null>(null);
  readonly hasAssetAccess = computed(
    () =>
      this.billingService.hasProjections() &&
      !this.billingService.subscriptionRequired(),
  );
  readonly showAssetPaywall = computed(
    () => this.billingService.loaded() && !this.hasAssetAccess(),
  );

  ngOnInit(): void {
    this.billingService
      .loadMe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
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

  simulateAsset(request: AssetSimulationRequestEvent): void {
    if (!this.hasAssetAccess()) return;

    this.assetError.set(null);
    this.assetLoading.set(true);
    this.assetRequest.next(request);
  }

  /**
   * Pelos mesmos motivos do resultado da carteira: a projeção exibida vale
   * para o ticker e os valores que a geraram. Deixá-la na tela depois de o
   * usuário trocar de ativo mostraria a projeção de um papel sob o nome de
   * outro.
   */
  discardAssetResult(): void {
    this.assetResult.set(null);
    this.assetLoading.set(false);
    this.assetRequest.next(null);
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
