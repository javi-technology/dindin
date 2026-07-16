import {
  Component,
  HostListener,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
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
import { Wallet, Position, AssetType, Fridge } from 'dindin-models';
import {
  decimalValidator,
  formatCurrency,
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
export class WalletComponent implements OnInit {
  private readonly walletService = inject(WalletService);
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly fb = inject(FormBuilder);

  wallets = signal<Wallet[]>([]);
  selectedWallet = signal<Wallet | null>(null);
  positions = signal<Position[]>([]);
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
    currentPrice: ['', [decimalValidator()]],
  });

  totalGeral = computed(() =>
    this.positions().reduce(
      (sum, position) => sum + position.quantity * position.averagePrice,
      0,
    ),
  );

  totalPosition = (position: Position): number =>
    position.quantity * position.averagePrice;

  ngOnInit(): void {
    this.loadWallets();
    this.loadFridges();
  }

  private loadFridges(): void {
    this.fridgeService.listFridges().subscribe({
      next: (response) => this.fridges.set(response),
      error: () => {},
    });
  }

  private loadWallets(): void {
    this.loading.set(true);
    this.walletService.list().subscribe({
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

  loadPositions(walletId: string): void {
    this.loading.set(true);
    this.positionService.list(walletId).subscribe({
      next: (response) => {
        this.positions.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Erro ao carregar posições.');
        this.loading.set(false);
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
        currentPrice:
          position.currentPrice != null ? String(position.currentPrice) : '',
      });
    } else {
      this.form.reset({
        ticker: '',
        assetType: 'FII',
        quantity: 0,
        averagePrice: '0',
        currentPrice: '',
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
    const currentPrice = this.parseDecimal(this.form.value.currentPrice);

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
      currentPrice?: number;
    } = {
      ticker: ticker.trim().toUpperCase(),
      assetType: this.form.value.assetType,
      quantity,
      averagePrice,
    };

    if (currentPrice !== null && currentPrice >= 0) {
      payload.currentPrice = currentPrice;
    }

    const editing = this.editingPosition();
    if (editing) {
      this.positionService.update(wallet.id, editing.id, payload).subscribe({
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
      this.positionService.create(wallet.id, payload).subscribe({
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

    this.positionService.delete(wallet.id, position.id).subscribe({
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

  private parseDecimal(value: string | number | null): number | null {
    return parseDecimal(value);
  }
}
