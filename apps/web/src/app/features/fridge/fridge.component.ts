import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { FridgeService } from '../../core/services/fridge.service';
import { AssetService } from '../../core/services/asset.service';
import { Asset, Fridge, FridgeItem } from 'dindin-models';
import {
  decimalValidator,
  formatCurrency,
  parseDecimal,
} from '../../shared/utils/format.util';
import {
  LucideRefrigerator,
  LucidePlus,
  LucidePencil,
  LucideTrash2,
} from '@lucide/angular';

@Component({
  selector: 'app-fridge',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideRefrigerator,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
  ],
  templateUrl: './fridge.component.html',
})
export class FridgeComponent implements OnInit {
  private readonly fridgeService = inject(FridgeService);
  private readonly assetService = inject(AssetService);
  private readonly fb = inject(FormBuilder);

  fridges = signal<Fridge[]>([]);
  selectedFridge = signal<Fridge | null>(null);
  items = signal<FridgeItem[]>([]);
  assets = signal<Asset[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  editingItem = signal<FridgeItem | null>(null);
  formVisible = signal(false);
  formError = signal<string | null>(null);
  deleteConfirmItem = signal<FridgeItem | null>(null);

  form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    quantity: [0, [Validators.required, Validators.min(0.0001)]],
    transferredPrice: ['0', [Validators.required, decimalValidator()]],
    targetPrice: ['0', [Validators.required, decimalValidator()]],
  });

  ngOnInit(): void {
    this.loadFridges();
    this.loadAssets();
  }

  private loadAssets(): void {
    this.assetService.list().subscribe({
      next: (response) => this.assets.set(response),
      error: () => {},
    });
  }

  private loadFridges(): void {
    this.loading.set(true);
    this.fridgeService.listFridges().subscribe({
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
    this.fridgeService.createFridge({ name: 'Geladeira Principal' }).subscribe({
      next: (fridge) => {
        this.fridges.set([fridge]);
        this.selectFridge(fridge);
        this.loading.set(false);
      },
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

  loadItems(fridgeId: string): void {
    this.loading.set(true);
    this.fridgeService.listItems(fridgeId).subscribe({
      next: (response) => {
        this.items.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Erro ao carregar itens.');
        this.loading.set(false);
      },
    });
  }

  openForm(item: FridgeItem | null = null): void {
    this.editingItem.set(item);
    this.formVisible.set(true);
    this.formError.set(null);

    if (item) {
      this.form.patchValue({
        ticker: item.ticker,
        quantity: item.quantity,
        transferredPrice: String(item.transferredPrice),
        targetPrice: String(item.targetPrice),
      });
    } else {
      this.form.reset({
        ticker: '',
        quantity: 0,
        transferredPrice: '0',
        targetPrice: '0',
      });
    }
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editingItem.set(null);
  }

  saveItem(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const fridge = this.selectedFridge();
    if (!fridge) {
      this.formError.set(
        'Nenhuma geladeira selecionada. Crie uma geladeira primeiro.',
      );
      return;
    }

    const ticker = this.form.value.ticker as string;
    const quantity = Number(this.form.value.quantity);
    const transferredPrice = this.parseDecimal(
      this.form.value.transferredPrice,
    );
    const targetPrice = this.parseDecimal(this.form.value.targetPrice);

    if (
      !ticker ||
      Number.isNaN(quantity) ||
      quantity <= 0 ||
      transferredPrice === null ||
      transferredPrice < 0 ||
      targetPrice === null ||
      targetPrice < 0
    ) {
      this.formError.set('Preencha todos os campos obrigatórios corretamente.');
      this.form.markAllAsTouched();
      return;
    }

    const editing = this.editingItem();
    if (editing) {
      const payload: { targetPrice?: number } = { targetPrice };

      this.fridgeService.updateItem(fridge.id, editing.id, payload).subscribe({
        next: () => {
          this.closeForm();
          this.loadItems(fridge.id);
        },
        error: () => {
          this.formError.set(
            'Erro ao atualizar item. Verifique os dados e tente novamente.',
          );
        },
      });
    } else {
      const payload: {
        ticker: string;
        quantity: number;
        transferredPrice: number;
        targetPrice: number;
      } = {
        ticker: ticker.trim().toUpperCase(),
        quantity,
        transferredPrice,
        targetPrice,
      };

      this.fridgeService.createItem(fridge.id, payload).subscribe({
        next: () => {
          this.closeForm();
          this.loadItems(fridge.id);
        },
        error: () => {
          this.formError.set(
            'Erro ao criar item. Verifique os dados e tente novamente.',
          );
        },
      });
    }
  }

  deleteItem(item: FridgeItem): void {
    this.deleteConfirmItem.set(item);
  }

  confirmDelete(): void {
    const item = this.deleteConfirmItem();
    const fridge = this.selectedFridge();
    if (!item || !fridge) return;

    this.fridgeService.deleteItem(fridge.id, item.id).subscribe({
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

  /** Calcula o potencial de ganho em percentual, ou null se não houver base. */
  potentialGain(item: FridgeItem): number | null {
    if (!item.targetPrice) return null;
    const base = item.currentPrice ?? item.transferredPrice;
    if (!base || base === 0) return null;
    return ((item.targetPrice - base) / base) * 100;
  }

  formatPotential(item: FridgeItem): string {
    const gain = this.potentialGain(item);
    if (gain === null) return '—';
    const formatted = gain.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted}%`;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.deleteConfirmItem()) {
      this.cancelDelete();
    } else if (this.formVisible()) {
      this.closeForm();
    }
  }

  formatCurrency = formatCurrency;

  private parseDecimal(value: string | number | null): number | null {
    return parseDecimal(value);
  }
}
