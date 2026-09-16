import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  finalize,
  merge,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import {
  DividendService,
  DividendYieldResponse,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';
import { Wallet, Position, AssetType, Asset, Fridge } from 'dindin-models';
import {
  decimalValidator,
  formatCurrency,
  formatPercent,
  parseDecimal,
} from '../../shared/utils/format.util';
import {
  resolveQuantity,
  weightedAveragePrice,
} from '../../shared/utils/position-quantity.util';
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
    ConfirmDialogComponent,
  ],
  templateUrl: './wallet.component.html',
})
export class WalletComponent implements OnInit {
  private readonly walletService = inject(WalletService);
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly assetService = inject(AssetService);
  private readonly dividendService = inject(DividendService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * Carteira a carregar. O switchMap sobre este Subject cancela a requisição
   * em voo quando outra carteira é escolhida, para que a resposta atrasada da
   * anterior não sobrescreva os dados da nova (issue #224).
   */
  private readonly walletToLoad$ = new Subject<string>();

  wallets = signal<Wallet[]>([]);
  selectedWallet = signal<Wallet | null>(null);
  positions = signal<Position[]>([]);
  assets = signal<Asset[]>([]);
  assetsError = signal<string | null>(null);
  dividendYield = signal<DividendYieldResponse | null>(null);
  monthlyIncome = signal<MonthlyIncomeResponse | null>(null);
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

  /** Quantidade e preço médio da posição ao abrir o formulário. */
  private originalQuantity = 0;
  private originalAveragePrice = '0';
  private averagePriceRecalculated = false;

  form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    assetType: ['FII', [Validators.required]],
    quantity: ['0', [Validators.required, this.quantityValidator()]],
    averagePrice: ['0', [Validators.required, decimalValidator()]],
    purchasePrice: ['', [decimalValidator()]],
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

  totalProventos = computed(() => this.monthlyIncome()?.total ?? 0);
  totalProventosFromFridge = computed(
    () => this.monthlyIncome()?.totalFromFridge ?? 0,
  );

  dividendYieldFor = (position: Position): number => {
    const found = this.dividendYield()?.byTicker.find(
      (item) => item.ticker === position.ticker,
    );
    return found?.yield ?? 0;
  };

  totalProventosFor = (position: Position): number => {
    const found = this.monthlyIncome()?.byTicker.find(
      (item) => item.ticker === position.ticker,
    );
    return found?.monthlyIncome ?? 0;
  };

  constructor() {
    this.walletToLoad$
      .pipe(
        switchMap((walletId) => this.walletData$(walletId)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  ngOnInit(): void {
    merge(
      this.form.controls['quantity'].valueChanges,
      this.form.controls['purchasePrice'].valueChanges,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncAveragePrice());
    this.loadWallets();
    this.loadFridges();
    this.loadAssets();
  }

  private loadAssets(): void {
    this.assetService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.fridges.set(response),
        error: () => {},
      });
  }

  private loadWallets(): void {
    this.loading.set(true);
    this.walletService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
    this.loadPositions(wallet.id);
  }

  onWalletChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const wallet = this.wallets().find((w) => w.id === target.value);
    if (wallet) {
      this.selectWallet(wallet);
    }
  }

  /** Dispara o carregamento da carteira, cancelando o anterior. */
  loadPositions(walletId: string): void {
    this.walletToLoad$.next(walletId);
  }

  /**
   * Carrega posições e, em seguida, os dois agregados que dependem delas.
   * Cada trecho trata o próprio erro e segue com EMPTY, para que a falha de
   * um agregado não cancele o outro nem impeça o `finalize`.
   */
  private walletData$(walletId: string): Observable<unknown> {
    this.loading.set(true);
    this.error.set(null);

    return this.positionService.list(walletId).pipe(
      tap((response) => this.positions.set(response)),
      switchMap(() =>
        merge(
          this.dividendService.getDividendYield(walletId).pipe(
            tap((response) => {
              this.dividendYield.set(response);
              this.error.set(null);
            }),
            catchError(() => {
              this.error.set('Erro ao carregar dividend yield.');
              return EMPTY;
            }),
          ),
          this.dividendService.getMonthlyIncome(walletId).pipe(
            tap((response) => this.monthlyIncome.set(response)),
            catchError(() => {
              this.error.set('Erro ao carregar renda mensal.');
              return EMPTY;
            }),
          ),
        ),
      ),
      catchError(() => {
        this.error.set('Erro ao carregar posições.');
        return EMPTY;
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  openForm(position: Position | null = null): void {
    this.editingPosition.set(position);
    this.formVisible.set(true);
    this.formError.set(null);
    this.originalQuantity = position?.quantity ?? 0;
    this.originalAveragePrice = String(position?.averagePrice ?? 0);
    this.averagePriceRecalculated = false;

    this.form.reset({
      ticker: position?.ticker ?? '',
      assetType: position?.assetType ?? 'FII',
      purchasePrice: '',
      quantity: String(this.originalQuantity),
      averagePrice: this.originalAveragePrice,
    });
  }

  /** Indica se a quantidade digitada é uma compra (`+N`). */
  isAddingQuantity(): boolean {
    return this.quantityText().startsWith('+');
  }

  /** Total resultante quando a quantidade é informada como variação. */
  quantityPreview(): string | null {
    if (!/^[+-]/.test(this.quantityText())) return null;
    const resolved = resolveQuantity(
      this.quantityText(),
      this.originalQuantity,
    );
    return resolved
      ? `Total: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(resolved.quantity)}`
      : null;
  }

  private quantityText(): string {
    return String(this.form.controls['quantity'].value ?? '').trim();
  }

  private quantityValidator(): ValidatorFn {
    return (control) =>
      resolveQuantity(control.value, this.originalQuantity)
        ? null
        : { invalidQuantity: true };
  }

  /** Recalcula o preço médio em compras (`+N`) com preço da compra informado. */
  private syncAveragePrice(): void {
    const purchasePriceControl = this.form.controls['purchasePrice'];
    const averagePriceControl = this.form.controls['averagePrice'];

    if (!this.isAddingQuantity() && purchasePriceControl.value) {
      purchasePriceControl.setValue('', { emitEvent: false });
    }

    const resolved = resolveQuantity(
      this.quantityText(),
      this.originalQuantity,
    );
    const purchasePrice = parseDecimal(purchasePriceControl.value);

    if (
      resolved?.mode === 'add' &&
      purchasePrice !== null &&
      purchasePrice >= 0
    ) {
      const averagePrice = weightedAveragePrice(
        this.originalQuantity,
        parseDecimal(this.originalAveragePrice) ?? 0,
        resolved.quantity - this.originalQuantity,
        purchasePrice,
      );
      averagePriceControl.setValue(averagePrice.toFixed(2));
      this.averagePriceRecalculated = true;
    } else if (this.averagePriceRecalculated) {
      averagePriceControl.setValue(this.originalAveragePrice);
      this.averagePriceRecalculated = false;
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
    const quantity = resolveQuantity(
      this.form.value.quantity,
      this.originalQuantity,
    )?.quantity;
    const averagePrice = this.parseDecimal(this.form.value.averagePrice);

    if (
      !ticker ||
      quantity === undefined ||
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
        .pipe(takeUntilDestroyed(this.destroyRef))
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
        .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
