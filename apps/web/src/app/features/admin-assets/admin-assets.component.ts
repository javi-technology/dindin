import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { AssetService } from '../../core/services/asset.service';
import { Asset } from 'dindin-models';
import { LucidePlus, LucideArrowLeft, LucidePencil } from '@lucide/angular';

@Component({
  selector: 'app-admin-assets',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucidePlus,
    LucideArrowLeft,
    LucidePencil,
  ],
  templateUrl: './admin-assets.component.html',
})
export class AdminAssetsComponent implements OnInit {
  private readonly assetService = inject(AssetService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  assets = signal<Asset[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  formError = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  editingTicker = signal<string | null>(null);

  form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    name: ['', [Validators.required]],
    assetType: ['FII', [Validators.required]],
    active: [true],
    qualifiedInvestor: [false],
  });

  assetTypes = [
    { value: 'FII', label: 'FII' },
    { value: 'STOCK', label: 'Ação' },
    { value: 'ETF', label: 'ETF' },
    { value: 'REIT', label: 'REIT' },
    { value: 'OTHER', label: 'Outro' },
  ];

  ngOnInit(): void {
    this.loadAssets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAssets(): void {
    this.loading.set(true);
    this.error.set(null);
    this.formError.set(null);
    this.assetService
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.assets.set(response);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar catálogo de ativos.');
          this.loading.set(false);
        },
      });
  }

  saveAsset(): void {
    this.formError.set(null);
    this.successMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.getRawValue();
    const ticker = (formValue.ticker as string).trim().toUpperCase();
    const payload = {
      name: (formValue.name as string).trim(),
      assetType: formValue.assetType,
      active: formValue.active as boolean,
      qualifiedInvestor: formValue.qualifiedInvestor as boolean,
    };
    const editingTicker = this.editingTicker();
    const request = editingTicker
      ? this.assetService.update(editingTicker, payload)
      : this.assetService.create({ ticker, ...payload });

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (asset) => {
        this.successMessage.set(
          editingTicker
            ? `Ativo ${asset.ticker} atualizado com sucesso.`
            : `Ativo ${asset.ticker} cadastrado com sucesso.`,
        );
        this.resetForm();
        this.loadAssets();
      },
      error: (err) => {
        const message =
          err.error?.error ||
          (editingTicker
            ? 'Erro ao atualizar ativo. Tente novamente.'
            : 'Erro ao cadastrar ativo. Tente novamente.');
        this.formError.set(message);
      },
    });
  }

  startEditing(asset: Asset): void {
    this.editingTicker.set(asset.ticker);
    this.form.patchValue({
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
      active: asset.active,
      qualifiedInvestor: asset.qualifiedInvestor ?? false,
    });
    this.form.get('ticker')?.disable();
    this.formError.set(null);
    this.successMessage.set(null);
  }

  cancelEditing(): void {
    this.resetForm();
  }

  private resetForm(): void {
    this.editingTicker.set(null);
    this.form.reset({
      ticker: '',
      name: '',
      assetType: 'FII',
      active: true,
      qualifiedInvestor: false,
    });
    this.form.get('ticker')?.enable();
  }
}
