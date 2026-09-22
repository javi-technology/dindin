import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  ApplySuggestionFormComponent,
  ApplySuggestionValue,
  ApplyTarget,
} from './components/apply-suggestion-form/apply-suggestion-form.component';
import {
  AiSuggestionPanelComponent,
  ApplyRequest,
  GenerateRequest,
} from './components/ai-suggestion-panel/ai-suggestion-panel.component';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { RecommendedWalletService } from '../../core/services/recommended-wallet.service';
import { WalletService } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { PositionService } from '../../core/services/position.service';
import { AssetService } from '../../core/services/asset.service';
import {
  RecommendedWallet,
  RecommendedWalletAsset,
  RecommendedWalletComparison,
  AiSuggestion,
  Asset,
  Position,
  Wallet,
} from 'dindin-models';
import { formatCurrency, formatPercent } from '../../shared/utils/format.util';
import {
  LucideArrowLeft,
  LucideCheck,
  LucideSparkles,
  LucideUpload,
  LucideWallet,
  LucideX,
} from '@lucide/angular';

type WalletTab = 'renda' | 'ganho';

@Component({
  selector: 'app-recommended-wallet',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LucideArrowLeft,
    LucideCheck,
    LucideSparkles,
    LucideUpload,
    LucideWallet,
    LucideX,
    ConfirmDialogComponent,
    ApplySuggestionFormComponent,
    AiSuggestionPanelComponent,
  ],
  templateUrl: './recommended-wallet.component.html',
})
export class RecommendedWalletComponent implements OnInit {
  private readonly recommendedWalletService = inject(RecommendedWalletService);
  private readonly walletService = inject(WalletService);
  private readonly authService = inject(AuthService);
  private readonly billingService = inject(BillingService);
  private readonly positionService = inject(PositionService);
  private readonly assetService = inject(AssetService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly compareRequest$ = new Subject<{
    walletId: string;
    month: string;
    tab: WalletTab;
  }>();

  constructor() {
    this.compareRequest$
      .pipe(
        switchMap(({ walletId, month, tab }) =>
          this.recommendedWalletService.compare(walletId, month, tab).pipe(
            catchError(() => {
              this.comparison.set(null);
              this.error.set('Erro ao comparar carteiras.');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((comparison) => {
        this.comparison.set(comparison);
        this.loadSavedSuggestion();
      });
  }

  recommendedWallets = signal<RecommendedWallet[]>([]);
  wallets = signal<Wallet[]>([]);
  selectedMonth = signal<string | null>(null);
  selectedWalletId = signal<string | null>(null);
  selectedTab = signal<WalletTab>('renda');
  comparison = signal<RecommendedWalletComparison | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  suggestion = signal<AiSuggestion | null>(null);
  suggestionLoading = signal(false);
  suggestionError = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isAdmin = signal(false);
  confirmModalOpen = signal(false);

  applyTarget = signal<ApplyTarget | null>(null);
  applyQuantity = signal('');
  applyPrice = signal('');
  applyPositions = signal<Position[] | null>(null);
  applyAssets = signal<Asset[]>([]);
  applyError = signal<string | null>(null);
  applySaving = signal(false);

  months = computed(() =>
    this.recommendedWallets().map((wallet) => wallet.month),
  );
  recommendedWallet = computed(
    () =>
      this.recommendedWallets().find(
        (wallet) => wallet.month === this.selectedMonth(),
      ) ?? null,
  );
  currentAssets = computed<RecommendedWalletAsset[]>(
    () => this.recommendedWallet()?.[this.selectedTab()] ?? [],
  );
  canGenerateSuggestion = computed(
    () => !!this.selectedWalletId() && !!this.selectedMonth(),
  );
  hasAiAccess = computed(
    () =>
      this.billingService.hasAi() &&
      !this.billingService.subscriptionRequired(),
  );
  showPaywall = computed(
    () => this.billingService.loaded() && !this.hasAiAccess(),
  );

  selectedWalletName = computed(
    () =>
      this.wallets().find((wallet) => wallet.id === this.selectedWalletId())
        ?.name ?? '',
  );
  ngOnInit(): void {
    this.loadRecommendedWallets();
    this.loadWallets();
    this.billingService.loadMe().subscribe({
      next: () => this.loadSavedSuggestion(),
      error: () => {},
    });
    this.authService
      .isAdmin()
      .then((isAdmin) => this.isAdmin.set(isAdmin))
      .catch(() => this.isAdmin.set(false));
  }

  selectMonth(month: string): void {
    this.selectedMonth.set(month);
    this.comparison.set(null);
    this.loadComparison();
  }

  selectWallet(walletId: string): void {
    this.selectedWalletId.set(walletId || null);
    this.loadComparison();
  }

  selectTab(tab: WalletTab): void {
    this.selectedTab.set(tab);
    this.loadComparison();
  }

  openConfirmModal(): void {
    if (this.recommendedWallet()?.status !== 'confirmed') {
      this.confirmModalOpen.set(true);
    }
  }

  closeConfirmModal(): void {
    this.confirmModalOpen.set(false);
  }

  confirmWallet(): void {
    const wallet = this.recommendedWallet();
    if (!wallet) return;

    this.recommendedWalletService.confirm(wallet.id).subscribe({
      next: (confirmed) => {
        this.recommendedWallets.update((wallets) =>
          wallets.map((item) => (item.id === confirmed.id ? confirmed : item)),
        );
        this.confirmModalOpen.set(false);
        this.successMessage.set('Carteira confirmada com sucesso.');
      },
      error: () => {
        this.error.set('Erro ao confirmar carteira recomendada.');
        this.confirmModalOpen.set(false);
      },
    });
  }

  onFileSelected(event: Event): void {
    this.error.set(null);
    this.successMessage.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!/^CartFII_/i.test(file.name)) {
      this.error.set('O nome do arquivo deve começar com CartFII_.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const contentBase64 = result.includes(',')
        ? result.split(',')[1]
        : result;
      this.recommendedWalletService.import(file.name, contentBase64).subscribe({
        next: (imported) => {
          this.recommendedWallets.update((wallets) => {
            const found = wallets.some((item) => item.id === imported.id);
            return found
              ? wallets.map((item) =>
                  item.id === imported.id ? imported : item,
                )
              : [imported, ...wallets];
          });
          this.selectedMonth.set(imported.month);
          this.successMessage.set('PDF importado com sucesso.');
          this.loadComparison();
        },
        error: () => {
          this.error.set('Erro ao importar PDF da carteira recomendada.');
        },
      });
    };
    reader.onerror = () => {
      this.error.set('Não foi possível ler o arquivo PDF.');
    };
    reader.readAsDataURL(file);
  }

  statusLabel(status: RecommendedWallet['status']): string {
    return status === 'confirmed' ? 'Confirmada' : 'Aguardando revisão';
  }

  comparisonStatusLabel(
    status: RecommendedWalletComparison['items'][number]['status'],
  ): string {
    if (status === 'match') return 'Recomendado e possuído';
    if (status === 'missing') return 'Falta comprar';
    return 'Fora da recomendação';
  }

  formatCurrency(value: number): string {
    return formatCurrency(value);
  }

  formatPercent(value: number): string {
    return formatPercent(value * 100);
  }

  openApply({ item, alternative }: ApplyRequest): void {
    const walletId = this.selectedWalletId();
    if (!walletId) return;

    const source = alternative ?? item;
    this.applyTarget.set({
      ticker: source.ticker,
      ...(alternative ? { fallbackFor: item.ticker } : {}),
    });
    this.applyQuantity.set(
      source.suggestedQuantity === undefined
        ? ''
        : String(source.suggestedQuantity),
    );
    this.applyPrice.set(
      source.referencePrice === undefined
        ? ''
        : String(source.referencePrice).replace('.', ','),
    );
    this.applyError.set(null);
    this.applyPositions.set(null);

    forkJoin([
      this.positionService.list(walletId),
      // Sem catálogo ainda dá para atualizar uma posição existente.
      this.assetService.list().pipe(catchError(() => of([] as Asset[]))),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([positions, assets]) => {
          this.applyPositions.set(positions);
          this.applyAssets.set(assets);
        },
        error: () =>
          this.applyError.set('Não foi possível carregar a carteira.'),
      });
  }

  closeApply(): void {
    // Enquanto a compra é lançada o modal fica aberto: fechar e abrir outro
    // item deixaria a resposta desta chegar no modal errado.
    if (this.applySaving()) return;
    this.applyTarget.set(null);
    this.applyError.set(null);
  }

  confirmApply(value: ApplySuggestionValue): void {
    const target = this.applyTarget();
    const suggestion = this.suggestion();
    if (!target || !suggestion) return;

    // A API lança a posição e marca o item na mesma transação (#276).
    this.applySaving.set(true);
    this.applyError.set(null);
    this.recommendedWalletService
      .applySuggestionItem(suggestion.id, {
        ticker: target.ticker,
        ...(target.fallbackFor ? { fallbackFor: target.fallbackFor } : {}),
        quantity: value.quantity,
        price: value.price,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.applySaving.set(false);
          this.suggestion.set(updated);
          this.closeApply();
          this.refreshComparison();
        },
        error: (error: { error?: { error?: string } }) => {
          this.applySaving.set(false);
          this.applyError.set(
            error?.error?.error ??
              'Não foi possível aplicar a compra. Tente novamente.',
          );
        },
      });
  }

  generateSuggestion({ contribution, force }: GenerateRequest): void {
    const walletId = this.selectedWalletId();
    const month = this.selectedMonth();
    const tab = this.selectedTab();
    if (!walletId || !month || !this.hasAiAccess()) return;

    this.suggestionError.set(null);
    this.suggestionLoading.set(true);
    const request =
      contribution === undefined
        ? this.recommendedWalletService.generateSuggestion(
            walletId,
            month,
            tab,
            force,
          )
        : this.recommendedWalletService.generateSuggestion(
            walletId,
            month,
            tab,
            force,
            contribution,
          );
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (suggestion) => {
        if (
          walletId === this.selectedWalletId() &&
          month === this.selectedMonth() &&
          tab === this.selectedTab()
        ) {
          this.suggestion.set(suggestion);
          this.suggestionLoading.set(false);
        }
      },
      error: (error: { status?: number; error?: { error?: string } }) => {
        if (
          walletId === this.selectedWalletId() &&
          month === this.selectedMonth() &&
          tab === this.selectedTab()
        ) {
          this.suggestionLoading.set(false);
          if (error?.status !== 403) {
            this.suggestionError.set(
              error?.status === 429 && error.error?.error
                ? error.error.error
                : 'Não foi possível gerar a sugestão. Tente novamente.',
            );
          }
        }
      },
    });
  }

  private loadRecommendedWallets(): void {
    this.loading.set(true);
    this.error.set(null);
    this.recommendedWalletService.list().subscribe({
      next: (wallets) => {
        const ordered = [...wallets].sort((a, b) =>
          b.month.localeCompare(a.month),
        );
        this.recommendedWallets.set(ordered);
        this.selectedMonth.set(ordered[0]?.month ?? null);
        this.loading.set(false);
        this.loadComparison();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Erro ao carregar carteiras recomendadas.');
      },
    });
  }

  private loadWallets(): void {
    this.walletService.list().subscribe({
      next: (wallets) => {
        this.wallets.set(wallets);
        this.selectedWalletId.set(wallets[0]?.id ?? null);
        this.loadComparison();
      },
      error: () => {
        this.error.set('Erro ao carregar carteiras do usuário.');
      },
    });
  }

  private loadComparison(): void {
    const walletId = this.selectedWalletId();
    const month = this.selectedMonth();
    this.suggestion.set(null);
    this.suggestionError.set(null);
    this.suggestionLoading.set(false);
    if (!walletId || !month) return;

    this.compareRequest$.next({
      walletId,
      month,
      tab: this.selectedTab(),
    });
  }

  /** Recompara sem limpar a sugestão exibida. */
  private refreshComparison(): void {
    const walletId = this.selectedWalletId();
    const month = this.selectedMonth();
    if (!walletId || !month) return;
    this.compareRequest$.next({ walletId, month, tab: this.selectedTab() });
  }

  private loadSavedSuggestion(): void {
    const walletId = this.selectedWalletId();
    const month = this.selectedMonth();
    const tab = this.selectedTab();
    if (!walletId || !month || !this.hasAiAccess()) return;

    this.recommendedWalletService
      .getSuggestion(walletId, month, tab)
      .subscribe({
        next: (suggestion) => {
          if (
            walletId === this.selectedWalletId() &&
            month === this.selectedMonth() &&
            tab === this.selectedTab()
          ) {
            this.suggestion.set(suggestion);
          }
        },
        error: (error: { status?: number }) => {
          if (
            error?.status !== 404 &&
            walletId === this.selectedWalletId() &&
            month === this.selectedMonth() &&
            tab === this.selectedTab()
          ) {
            this.suggestionError.set(
              'Não foi possível carregar a sugestão salva.',
            );
          }
        },
      });
  }
}
