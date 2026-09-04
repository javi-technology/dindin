import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { RecommendedWalletService } from '../../core/services/recommended-wallet.service';
import { WalletService } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';
import {
  RecommendedWallet,
  RecommendedWalletAsset,
  RecommendedWalletComparison,
  Wallet,
} from 'dindin-models';
import { formatCurrency, formatPercent } from '../../shared/utils/format.util';
import {
  LucideArrowLeft,
  LucideCheck,
  LucideUpload,
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
    LucideUpload,
    LucideX,
  ],
  templateUrl: './recommended-wallet.component.html',
})
export class RecommendedWalletComponent implements OnInit {
  private readonly recommendedWalletService = inject(RecommendedWalletService);
  private readonly walletService = inject(WalletService);
  private readonly authService = inject(AuthService);
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
      .subscribe((comparison) => this.comparison.set(comparison));
  }

  recommendedWallets = signal<RecommendedWallet[]>([]);
  wallets = signal<Wallet[]>([]);
  selectedMonth = signal<string | null>(null);
  selectedWalletId = signal<string | null>(null);
  selectedTab = signal<WalletTab>('renda');
  comparison = signal<RecommendedWalletComparison | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isAdmin = signal(false);
  confirmModalOpen = signal(false);

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

  ngOnInit(): void {
    this.loadRecommendedWallets();
    this.loadWallets();
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
    if (!walletId || !month) return;

    this.compareRequest$.next({
      walletId,
      month,
      tab: this.selectedTab(),
    });
  }
}
