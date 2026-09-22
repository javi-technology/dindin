import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { PatrimonySnapshot } from 'dindin-models';
import type { TickerValue } from 'dindin-shared-types';
import {
  LucideRefrigerator,
  LucideTrendingUp,
  LucideWallet,
} from '@lucide/angular';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { HealthService } from '../../core/services/health.service';
import { PatrimonyService } from '../../core/services/patrimony.service';
import { formatCurrency } from '../../shared/utils/format.util';
import { PatrimonyChartComponent } from '../../shared/components/charts/patrimony-chart/patrimony-chart.component';
import { CompositionChartComponent } from '../../shared/components/charts/composition-chart/composition-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    LucideWallet,
    LucideRefrigerator,
    LucideTrendingUp,
    PatrimonyChartComponent,
    CompositionChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);
  private readonly healthService = inject(HealthService);
  private readonly patrimonyService = inject(PatrimonyService);
  private readonly destroyRef = inject(DestroyRef);

  totalWallet = signal(0);
  composition = signal<TickerValue[]>([]);
  totalFridge = signal(0);
  totalDividends = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  isAdmin = signal(false);
  backendOnline = signal(false);
  patrimonyHistory = signal<PatrimonySnapshot[]>([]);
  patrimonyError = signal<string | null>(null);

  displayValue(value: number): string {
    return this.loading() || this.error() ? '—' : formatCurrency(value);
  }

  ngOnInit(): void {
    this.authService
      .isAdmin()
      .then((isAdmin) => this.isAdmin.set(isAdmin))
      .catch(() => this.isAdmin.set(false));

    this.loadSummary();
    this.loadHealth();
    this.loadPatrimonyHistory();
  }

  private loadHealth(): void {
    this.healthService
      .check()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.backendOnline.set(true),
        error: () => this.backendOnline.set(false),
      });
  }

  private loadPatrimonyHistory(): void {
    this.patrimonyService
      .recordSnapshot()
      .pipe(
        catchError(() => of(null)),
        switchMap(() => this.patrimonyService.getHistory()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (history) => {
          this.patrimonyHistory.set(history);
          this.patrimonyError.set(null);
        },
        error: () => {
          this.patrimonyError.set('Erro ao carregar evolução patrimonial.');
        },
      });
  }

  private loadSummary(): void {
    // Uma requisição no lugar de 1 + carteiras + 1 + geladeiras + carteiras
    // (issue #300). Patrimônio, geladeira, renda e composição vêm prontos.
    this.dashboardService
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.totalWallet.set(summary.totalWallet);
          this.totalFridge.set(summary.totalFridge);
          this.totalDividends.set(summary.monthlyIncomeTotal);
          this.composition.set(summary.composition);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar resumo do dashboard.');
          this.loading.set(false);
        },
      });
  }
}
