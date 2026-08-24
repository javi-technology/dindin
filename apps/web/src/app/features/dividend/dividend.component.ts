import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DividendService,
  MonthlyDividendProjection,
  DividendProjectionResponse,
} from '../../core/services/dividend.service';
import { formatCurrency } from '../../shared/utils/format.util';

@Component({
  selector: 'app-dividend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dividend.component.html',
})
export class DividendComponent implements OnInit {
  private readonly dividendService = inject(DividendService);
  private readonly destroyRef = inject(DestroyRef);

  projections = signal<MonthlyDividendProjection[]>([]);
  total = signal<number>(0);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadProjection();
  }

  private loadProjection(): void {
    this.dividendService
      .getProjection()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: DividendProjectionResponse) => {
          this.projections.set(response.projections);
          this.total.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar projeção');
          this.loading.set(false);
        },
      });
  }

  formatCurrency = formatCurrency;
}
