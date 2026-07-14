import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { FridgeService } from '../../core/services/fridge.service';
import { Fridge, FridgeItem } from 'dindin-models';
import {
  decimalValidator,
  formatCurrency,
  parseDecimal,
} from '../../shared/utils/format.util';
import { LucideSnowflake, LucidePencil, LucideTrash2 } from '@lucide/angular';

@Component({
  selector: 'app-fridge',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideSnowflake,
    LucidePencil,
    LucideTrash2,
  ],
  templateUrl: './fridge.component.html',
})
export class FridgeComponent implements OnInit {
  private readonly fridgeService = inject(FridgeService);
  private readonly fb = inject(FormBuilder);

  fridges = signal<Fridge[]>([]);
  selectedFridge = signal<Fridge | null>(null);
  items = signal<FridgeItem[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  editingItem = signal<FridgeItem | null>(null);
  formVisible = signal(false);
  formError = signal<string | null>(null);
  deleteConfirmItem = signal<FridgeItem | null>(null);

  form: FormGroup = this.fb.group({
    targetPrice: ['', [Validators.required, decimalValidator()]],
  });

  ngOnInit(): void {
    this.loadFridges();
  }

  loadFridges(): void {
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

  selectFridge(fridge: Fridge): void {
    this.selectedFridge.set(fridge);
    this.loadItems(fridge.id);
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

  /** Calcula o potencial de ganho em percentual, ou null se não houver base. */
  potentialGain(item: FridgeItem): number | null {
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

  formatCurrency = formatCurrency;

  openForm(item: FridgeItem): void {
    this.editingItem.set(item);
    this.formVisible.set(true);
    this.formError.set(null);
    this.form.patchValue({ targetPrice: String(item.targetPrice) });
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editingItem.set(null);
  }

  saveTarget(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const fridge = this.selectedFridge();
    const item = this.editingItem();
    if (!fridge || !item) {
      this.formError.set('Nenhuma geladeira ou item selecionado.');
      return;
    }

    const targetPrice = parseDecimal(this.form.value.targetPrice);
    if (targetPrice === null || targetPrice < 0) {
      this.formError.set('Informe um preço-alvo válido.');
      this.form.markAllAsTouched();
      return;
    }

    this.fridgeService
      .updateItem(fridge.id, item.id, { targetPrice })
      .subscribe({
        next: () => {
          this.closeForm();
          this.loadItems(fridge.id);
        },
        error: () => {
          this.formError.set(
            'Erro ao atualizar preço-alvo. Verifique os dados e tente novamente.',
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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.deleteConfirmItem()) {
      this.cancelDelete();
    } else if (this.formVisible()) {
      this.closeForm();
    }
  }
}
