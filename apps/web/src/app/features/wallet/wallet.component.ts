import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subject, takeUntil, finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import {
  DividendService,
  DividendYieldResponse,
} from '../../core/services/dividend.service';
import { Wallet, Position, AssetType, Asset, Fridge } from 'dindin-models';
import {
  decimalValidator,
  formatCurrency,
  formatPercent,
  parseDecimal,
} from '../../shared/utils/format.util';
import {
  LucideWallet,
  LucidePlus,
  LucidePencil,
  LucideTrash2,
  LucideRefrigerator,
} from '@lucide/angular';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideWallet,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideRefrigerator,
  ],
  templateUrl: './wallet.component.html',
})
export class WalletComponent implements OnInit, OnDestroy {
  private readonly walletService = inject(WalletService);
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly assetService = inject(AssetService);
  private readonly dividendService = inject(DividendService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();
  private positionsAbort$ = new Subject<void>();
  private dividendYieldAbort$ = new Subject<void>();

  wallets = signal<Wallet[]>([]);
  selectedWallet = signal<Wallet | null>(null);
  positions = signal<Position[]>([]);
  assets = signal<Asset[]>([]);
  assetsError = signal<string | null>(null);
  dividendYield = signal<DividendYieldResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  editingPosition = signal<Position | null>(null);
  formVisible = signal(false);
  formError = signal<string | null>(null);
  deleteConfirmPosition = signal<Position | null>(null);

  fridges = signal<Fridge[]>([]);
  moveToFridgePosition = signal<Position | null>(null);
  moveToFridgeError = signal<string | null>(null);

  moveToFridgeForm: FormGroup = this.fb.group({
    fridgeId: ['', [Validators.required]],
    targetPrice: ['0', [Validators.required, decimalValidator()]],
  });

  form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    assetType: ['FII', [Validators.required]],
    quantity: [0, [Validators.required, Validators.min(0.0001)]],
    averagePrice: ['0', [Validators.required, decimalValidator()]],
  });

  /** Retorna o preço unitário atual (mercado) ou o preço médio como fallback. */
  unitPrice = (position: Position): number =>
    position.currentPrice ?? position.averagePrice;

  /** Retorna o valor total da posição (quantidade × preço unitário atual). */
  totalPosition = (position: Position): number =>
    position.quantity * this.unitPrice(position);

  totalGeral = computed(() =>
    this.positions().reduce(
      (sum, position) => sum + this.totalPosition(position),
      0,
    ),
  );

  totalDividendYield = computed(() => this.dividendYield()?.total?.yield ?? 0);

  dividendYieldFor = (position: Position): number => {
    const found = this.dividendYield()?.byTicker.find(
      (item) => item.ticker === position.ticker,
    );
    return found?.yield ?? 0;
  };

  ngOnInit(): void {
    this.loadWallets();
    this.loadFridges();
    this.loadAssets();
  }

  private loadAssets(): void {
    this.assetService
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.assets.set(response);
          this.assetsError.set(null);
        },
        error: () => {
          this.assetsError.set(
            'Erro ao carregar catálogo de ativos. Recarregue a página para tentar novamente.',
          );
        },
      });
  }

  private loadFridges(): void {
    this.fridgeService
      .listFridges()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => this.fridges.set(response),
        error: () => {},
      });
  }

  private loadWallets(): void {
    this.loading.set(true);
    this.walletService
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.wallets.set(response);
          if (response.length > 0) {
            this.selectWallet(response[0]);
          } else {
            this.selectedWallet.set(null);
            this.positions.set([]);
          }
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar carteiras.');
          this.loading.set(false);
        },
      });
  }

  createDefaultWallet(): void {
    this.loading.set(true);
    this.walletService
      .create({ name: 'Carteira Principal', currency: 'BRL' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (wallet) => {
          this.wallets.set([wallet]);
          this.selectWallet(wallet);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao criar carteira padrão.');
          this.loading.set(false);
        },
      });
  }

  selectWallet(wallet: Wallet): void {
    this.selectedWallet.set(wallet);
    this.abortPendingPositionsRequest();
    this.abortPendingDividendYieldRequest();
    this.loadPositions(wallet.id);
  }

  ngOnDestroy(): void {
    this.abortPendingPositionsRequest();
    this.abortPendingDividendYieldRequest();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private abortPendingPositionsRequest(): void {
    this.positionsAbort$.next();
    this.positionsAbort$.complete();
    this.positionsAbort$ = new Subject<void>();
  }

  private abortPendingDividendYieldRequest(): void {
    this.dividendYieldAbort$.next();
    this.dividendYieldAbort$.complete();
    this.dividendYieldAbort$ = new Subject<void>();
  }

  onWalletChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const wallet = this.wallets().find((w) => w.id === target.value);
    if (wallet) {
      this.selectWallet(wallet);
    }
  }

  loadPositions(walletId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.positionService
      .list(walletId)
      .pipe(
        takeUntil(this.destroy$),
        takeUntil(this.positionsAbort$),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.positions.set(response);
          this.loadDividendYield(walletId);
        },
        error: () => {
          this.error.set('Erro ao carregar posições.');
        },
      });
  }

  private loadDividendYield(walletId: string): void {
    this.dividendService
      .getDividendYield(walletId)
      .pipe(
        takeUntil(this.dividendYieldAbort$),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.dividendYield.set(response);
          this.error.set(null);
        },
        error: () => {
          this.error.set('Erro ao carregar dividend yield.');
        },
      });
  }

  openForm(position: Position | null = null): void {
    this.editingPosition.set(position);
    this.formVisible.set(true);
    this.formError.set(null);

    if (position) {
      this.form.patchValue({
        ticker: position.ticker,
        assetType: position.assetType,
        quantity: position.quantity,
        averagePrice: String(position.averagePrice),
      });
    } else {
      this.form.reset({
        ticker: '',
        assetType: 'FII',
        quantity: 0,
        averagePrice: '0',
      });
    }
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editingPosition.set(null);
  }

  savePosition(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const wallet = this.selectedWallet();
    if (!wallet) {
      this.formError.set(
        'Nenhuma carteira selecionada. Crie uma carteira primeiro.',
      );
      return;
    }

    const ticker = this.form.value.ticker as string;
    const quantity = Number(this.form.value.quantity);
    const averagePrice = this.parseDecimal(this.form.value.averagePrice);

    if (
      !ticker ||
      Number.isNaN(quantity) ||
      quantity <= 0 ||
      averagePrice === null ||
      averagePrice < 0
    ) {
      this.formError.set('Preencha todos os campos obrigatórios corretamente.');
      this.form.markAllAsTouched();
      return;
    }

    const payload: {
      ticker: string;
      assetType: AssetType;
      quantity: number;
      averagePrice: number;
    } = {
      ticker: ticker.trim().toUpperCase(),
      assetType: this.form.value.assetType,
      quantity,
      averagePrice,
    };

    const editing = this.editingPosition();
    if (editing) {
      this.positionService
        .update(wallet.id, editing.id, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.closeForm();
            this.loadPositions(wallet.id);
          },
          error: () => {
            this.formError.set(
              'Erro ao atualizar posição. Verifique os dados e tente novamente.',
            );
          },
        });
    } else {
      this.positionService
        .create(wallet.id, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.closeForm();
            this.loadPositions(wallet.id);
          },
          error: () => {
            this.formError.set(
              'Erro ao criar posição. Verifique os dados e tente novamente.',
            );
          },
        });
    }
  }

  deletePosition(position: Position): void {
    this.deleteConfirmPosition.set(position);
  }

  confirmDelete(): void {
    const position = this.deleteConfirmPosition();
    const wallet = this.selectedWallet();
    if (!position || !wallet) return;

    this.positionService
      .delete(wallet.id, position.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deleteConfirmPosition.set(null);
          this.loadPositions(wallet.id);
        },
        error: () => this.error.set('Erro ao remover posição.'),
      });
  }

  cancelDelete(): void {
    this.deleteConfirmPosition.set(null);
  }

  openMoveToFridge(position: Position): void {
    this.moveToFridgePosition.set(position);
    this.moveToFridgeError.set(null);
    this.moveToFridgeForm.reset({
      fridgeId: this.fridges().length > 0 ? this.fridges()[0].id : '',
      targetPrice: '0',
    });
  }

  closeMoveToFridge(): void {
    this.moveToFridgePosition.set(null);
    this.moveToFridgeError.set(null);
  }

  confirmMoveToFridge(): void {
    if (this.moveToFridgeForm.invalid) {
      this.moveToFridgeForm.markAllAsTouched();
      return;
    }

    const position = this.moveToFridgePosition();
    const wallet = this.selectedWallet();
    if (!position || !wallet) return;

    const fridgeId = this.moveToFridgeForm.value.fridgeId as string;
    const targetPrice = this.parseDecimal(
      this.moveToFridgeForm.value.targetPrice,
    );

    if (!fridgeId || targetPrice === null || targetPrice < 0) {
      this.moveToFridgeError.set('Preencha todos os campos corretamente.');
      return;
    }

    this.positionService
      .moveToFridge(wallet.id, position.id, { fridgeId, targetPrice })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeMoveToFridge();
          this.loadPositions(wallet.id);
        },
        error: () => {
          this.moveToFridgeError.set(
            'Erro ao mover posição para a geladeira. Tente novamente.',
          );
        },
      });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.moveToFridgePosition()) {
      this.closeMoveToFridge();
    } else if (this.deleteConfirmPosition()) {
      this.cancelDelete();
    } else if (this.formVisible()) {
      this.closeForm();
    }
  }

  formatCurrency = formatCurrency;
  formatPercent = formatPercent;

  private parseDecimal(value: string | number | null): number | null {
    return parseDecimal(value);
  }
}
