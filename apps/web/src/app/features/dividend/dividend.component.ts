import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, switchMap } from 'rxjs';
import {
  DividendService,
  MonthlyIncomeItem,
} from '../../core/services/dividend.service';
import { WalletService } from '../../core/services/wallet.service';
import { formatCurrency } from '../../shared/utils/format.util';
import { aggregateMonthlyIncome } from '../../shared/utils/monthly-income.util';

@Component({
  selector: 'app-dividend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dividend.component.html',
})
export class DividendComponent implements OnInit {
  private readonly dividendService = inject(DividendService);
  private readonly walletService = inject(WalletService);
  private readonly destroyRef = inject(DestroyRef);

  byTicker = signal<MonthlyIncomeItem[]>([]);
  total = signal<number>(0);
  totalFromFridge = signal<number>(0);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadMonthlyIncome();
  }

  private loadMonthlyIncome(): void {
    this.walletService
      .list()
      .pipe(
        switchMap((wallets) =>
          wallets.length === 0
            ? of([])
            : forkJoin(
                wallets.map((wallet) =>
                  this.dividendService.getMonthlyIncome(wallet.id),
                ),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (responses) => {
          const aggregated = aggregateMonthlyIncome(responses);
          this.byTicker.set(aggregated.byTicker);
          this.total.set(aggregated.total);
          this.totalFromFridge.set(aggregated.totalFromFridge);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar proventos');
          this.loading.set(false);
        },
      });
  }

  formatCurrency = formatCurrency;
}
