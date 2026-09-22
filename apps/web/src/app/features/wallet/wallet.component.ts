import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
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
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { PositionsTableComponent } from './components/positions-table/positions-table.component';
import {
  PositionFormComponent,
  PositionFormValue,
} from './components/position-form/position-form.component';
import {
  MoveToFridgeFormComponent,
  MoveToFridgeValue,
} from './components/move-to-fridge-form/move-to-fridge-form.component';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import { SetupService } from '../../core/services/setup.service';
import {
  DividendService,
  DividendYieldResponse,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';
import { Wallet, Position, Asset, Fridge } from 'dindin-models';
import { formatCurrency, parseDecimal } from '../../shared/utils/format.util';
import { LucideWallet, LucidePlus } from '@lucide/angular';

@Component({
  selector: 'app-wallet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LucideWallet,
    LucidePlus,
    ConfirmDialogComponent,
    ModalComponent,
    PositionsTableComponent,
    PositionFormComponent,
    MoveToFridgeFormComponent,
  ],
  templateUrl: './wallet.component.html',
})
export class WalletComponent implements OnInit {
  private readonly walletService = inject(WalletService);
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly assetService = inject(AssetService);
  private readonly dividendService = inject(DividendService);
  private readonly setupService = inject(SetupService);
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

  constructor() {
    this.walletToLoad$
      .pipe(
        switchMap((walletId) => this.walletData$(walletId)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  ngOnInit(): void {
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
    this.setupService
      .createDefault('wallet')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadWallets(),
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
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editingPosition.set(null);
  }

  /** Recebe o payload já validado pelo formulário e decide criar ou editar. */
  savePosition(payload: PositionFormValue): void {
    const wallet = this.selectedWallet();
    if (!wallet) {
      this.formError.set(
        'Nenhuma carteira selecionada. Crie uma carteira primeiro.',
      );
      return;
    }

    const editing = this.editingPosition();
    const request$ = editing
      ? this.positionService.update(wallet.id, editing.id, payload)
      : this.positionService.create(wallet.id, payload);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.closeForm();
        this.loadPositions(wallet.id);
      },
      error: () => {
        this.formError.set(
          editing
            ? 'Erro ao atualizar posição. Verifique os dados e tente novamente.'
            : 'Erro ao criar posição. Verifique os dados e tente novamente.',
        );
      },
    });
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
  }

  closeMoveToFridge(): void {
    this.moveToFridgePosition.set(null);
    this.moveToFridgeError.set(null);
  }

  confirmMoveToFridge(payload: MoveToFridgeValue): void {
    const position = this.moveToFridgePosition();
    const wallet = this.selectedWallet();
    if (!position || !wallet) return;

    this.positionService
      .moveToFridge(wallet.id, position.id, payload)
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

  formatCurrency = formatCurrency;

  private parseDecimal(value: string | number | null): number | null {
    return parseDecimal(value);
  }
}
