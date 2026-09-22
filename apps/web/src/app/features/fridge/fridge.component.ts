import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap, tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { FridgeItemsTableComponent } from './components/fridge-items-table/fridge-items-table.component';
import {
  FridgeItemFormComponent,
  FridgeItemFormValue,
} from './components/fridge-item-form/fridge-item-form.component';
import { UnfreezeFormComponent } from './components/unfreeze-form/unfreeze-form.component';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import { WalletService } from '../../core/services/wallet.service';
import { SetupService } from '../../core/services/setup.service';
import { Asset, Fridge, FridgeItem, Wallet } from 'dindin-models';
import { formatCurrency, parseDecimal } from '../../shared/utils/format.util';
import {
  LucideRefrigerator,
  LucidePlus,
  LucidePencil,
  LucideTrash2,
  LucideFlame,
} from '@lucide/angular';

@Component({
  selector: 'app-fridge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideRefrigerator,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideFlame,
    ConfirmDialogComponent,
    ModalComponent,
    FridgeItemsTableComponent,
    FridgeItemFormComponent,
    UnfreezeFormComponent,
  ],
  templateUrl: './fridge.component.html',
})
export class FridgeComponent implements OnInit {
  private readonly fridgeService = inject(FridgeService);
  private readonly assetService = inject(AssetService);
  private readonly walletService = inject(WalletService);
  private readonly setupService = inject(SetupService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Geladeira a carregar. O switchMap sobre este Subject cancela a requisição
   * anterior, para que a resposta de uma geladeira trocada não sobrescreva a
   * lista da geladeira atual.
   */
  private readonly fridgeToLoad$ = new Subject<string>();

  fridges = signal<Fridge[]>([]);
  selectedFridge = signal<Fridge | null>(null);
  items = signal<FridgeItem[]>([]);
  assets = signal<Asset[]>([]);
  wallets = signal<Wallet[]>([]);
  assetsError = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  editingItem = signal<FridgeItem | null>(null);
  formVisible = signal(false);
  formError = signal<string | null>(null);
  deleteConfirmItem = signal<FridgeItem | null>(null);
  unfreezeItemTarget = signal<FridgeItem | null>(null);
  unfreezeError = signal<string | null>(null);

  constructor() {
    this.fridgeToLoad$
      .pipe(
        switchMap((fridgeId) => this.items$(fridgeId)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  ngOnInit(): void {
    this.loadFridges();
    this.loadAssets();
    this.loadWallets();
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

  private loadWallets(): void {
    this.walletService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.wallets.set(response),
        error: () => this.error.set('Erro ao carregar carteiras.'),
      });
  }

  private loadFridges(): void {
    this.loading.set(true);
    this.fridgeService
      .listFridges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.fridges.set(response);
          if (response.length > 0) {
            this.selectFridge(response[0]);
          } else {
            this.selectedFridge.set(null);
            this.items.set([]);
          }
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar geladeiras.');
          this.loading.set(false);
        },
      });
  }

  createDefaultFridge(): void {
    this.loading.set(true);
    this.setupService
      .createDefault('fridge')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadFridges(),
        error: () => {
          this.error.set('Erro ao criar geladeira padrão.');
          this.loading.set(false);
        },
      });
  }

  selectFridge(fridge: Fridge): void {
    this.selectedFridge.set(fridge);
    this.loadItems(fridge.id);
  }

  onFridgeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const fridge = this.fridges().find((f) => f.id === target.value);
    if (fridge) {
      this.selectFridge(fridge);
    }
  }

  /** Dispara o carregamento dos itens, cancelando o anterior. */
  loadItems(fridgeId: string): void {
    this.fridgeToLoad$.next(fridgeId);
  }

  /**
   * Trata o próprio erro e segue com EMPTY, para que uma falha não encerre o
   * fluxo e impeça as trocas de geladeira seguintes.
   */
  private items$(fridgeId: string) {
    this.loading.set(true);
    return this.fridgeService.listItems(fridgeId).pipe(
      tap((response) => {
        this.items.set(response);
        this.loading.set(false);
      }),
      catchError(() => {
        this.error.set('Erro ao carregar itens.');
        this.loading.set(false);
        return EMPTY;
      }),
    );
  }

  openForm(item: FridgeItem | null = null): void {
    this.editingItem.set(item);
    this.formVisible.set(true);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editingItem.set(null);
  }

  /** Recebe o payload já montado pelo formulário e decide criar ou editar. */
  saveItem(payload: FridgeItemFormValue): void {
    const fridge = this.selectedFridge();
    if (!fridge) {
      this.formError.set(
        'Nenhuma geladeira selecionada. Crie uma geladeira primeiro.',
      );
      return;
    }

    const editing = this.editingItem();
    const request$ = editing
      ? this.fridgeService.updateItem(fridge.id, editing.id, payload)
      : this.fridgeService.createItem(fridge.id, payload);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.closeForm();
        this.loadItems(fridge.id);
      },
      error: () => {
        this.formError.set(
          editing
            ? 'Erro ao atualizar item. Verifique os dados e tente novamente.'
            : 'Erro ao criar item. Verifique os dados e tente novamente.',
        );
      },
    });
  }

  deleteItem(item: FridgeItem): void {
    this.deleteConfirmItem.set(item);
  }

  confirmDelete(): void {
    const item = this.deleteConfirmItem();
    const fridge = this.selectedFridge();
    if (!item || !fridge) return;

    this.fridgeService
      .deleteItem(fridge.id, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteConfirmItem.set(null);
          this.loadItems(fridge.id);
        },
        error: () => this.error.set('Erro ao remover item.'),
      });
  }

  cancelDelete(): void {
    this.deleteConfirmItem.set(null);
  }

  openUnfreeze(item: FridgeItem): void {
    this.unfreezeItemTarget.set(item);
    this.unfreezeError.set(null);
  }

  cancelUnfreeze(): void {
    this.unfreezeItemTarget.set(null);
    this.unfreezeError.set(null);
  }

  confirmUnfreeze(walletId: string): void {
    const item = this.unfreezeItemTarget();
    const fridge = this.selectedFridge();
    if (!item || !fridge) return;

    this.fridgeService
      .unfreezeItem(fridge.id, item.id, walletId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items.update((current) =>
            current.filter((currentItem) => currentItem.id !== item.id),
          );
          this.cancelUnfreeze();
        },
        error: () => this.unfreezeError.set('Erro ao descongelar item.'),
      });
  }

  formatCurrency = formatCurrency;

  private parseDecimal(value: string | number | null): number | null {
    return parseDecimal(value);
  }
}
