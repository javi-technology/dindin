import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, switchMap } from 'rxjs';
import {
  DividendService,
  MonthlyDividendReport,
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
  report = signal<MonthlyDividendReport | null>(null);
  reportLoading = signal(true);
  reportError = signal<string | null>(null);
  selectedYear = signal<number>(new Date().getFullYear());

  ngOnInit(): void {
    this.loadMonthlyIncome();
    this.loadReport(this.selectedYear());
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

  private loadReport(year: number): void {
    this.reportLoading.set(true);
    this.reportError.set(null);

    this.dividendService
      .getMonthlyReport(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.reportLoading.set(false);
        },
        error: () => {
          this.reportError.set('Erro ao carregar relatório mensal');
          this.reportLoading.set(false);
        },
      });
  }

  reportYears(): number[] {
    const years = this.report()?.availableYears ?? [];
    return years.includes(this.selectedYear())
      ? years
      : [this.selectedYear(), ...years];
  }

  onYearChange(event: Event): void {
    const year = Number((event.target as HTMLSelectElement).value);
    this.selectedYear.set(year);
    this.loadReport(year);
  }

  formatMonth(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'short',
      year: 'numeric',
    })
      .format(new Date(year, monthNumber - 1, 1))
      .replace(/\./g, '')
      .replace(' de ', '/');
  }

  formatCurrency = formatCurrency;
}
