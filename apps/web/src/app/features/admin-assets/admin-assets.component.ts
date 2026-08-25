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
import { LucidePlus, LucideArrowLeft } from '@lucide/angular';

@Component({
  selector: 'app-admin-assets',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucidePlus,
    LucideArrowLeft,
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

  form: FormGroup = this.fb.group({
    ticker: ['', [Validators.required]],
    name: ['', [Validators.required]],
    assetType: ['FII', [Validators.required]],
    active: [true],
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

    const payload = {
      ticker: (this.form.value.ticker as string).trim().toUpperCase(),
      name: (this.form.value.name as string).trim(),
      assetType: this.form.value.assetType,
      active: this.form.value.active as boolean,
    };

    this.assetService
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (asset) => {
          this.successMessage.set(
            `Ativo ${asset.ticker} cadastrado com sucesso.`,
          );
          this.form.reset({ assetType: 'FII', active: true });
          this.loadAssets();
        },
        error: (err) => {
          const message =
            err.error?.error || 'Erro ao cadastrar ativo. Tente novamente.';
          this.formError.set(message);
        },
      });
  }
}
