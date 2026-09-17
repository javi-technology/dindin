import {
  Component,
  OnInit,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, shareReplay, switchMap } from 'rxjs';
import {
  DividendService,
  MonthlyDividendReport,
  MonthlyIncomeItem,
} from '../../core/services/dividend.service';
import { WalletService } from '../../core/services/wallet.service';
import {
  formatCurrency,
  formatDate,
  formatPercent,
} from '../../shared/utils/format.util';
import { aggregateMonthlyIncome } from '../../shared/utils/monthly-income.util';
import { buildMonthlySeries } from '../../shared/utils/monthly-series.util';
import { buildTickerConcentration } from '../../shared/utils/ticker-concentration.util';
import { buildPaymentSchedule } from '../../shared/utils/payment-schedule.util';
import { BarChartComponent } from '../../shared/components/charts/bar-chart/bar-chart.component';
import {
  aggregateDividendYield,
  lastMonthSummary,
  monthlyAverage,
} from '../../shared/utils/dividend-kpi.util';

@Component({
  selector: 'app-dividend',
  standalone: true,
  imports: [CommonModule, BarChartComponent],
  templateUrl: './dividend.component.html',
})
export class DividendComponent implements OnInit {
  private readonly dividendService = inject(DividendService);
  private readonly walletService = inject(WalletService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Lista de carteiras compartilhada: projeção mensal e dividend yield
   * partem dela e, sem o compartilhamento, cada um dispararia seu próprio
   * GET idêntico ao abrir a tela.
   */
  private readonly wallets$ = this.walletService
    .list()
    // `refCount: true` para que a inscrição na fonte caia junto com o último
    // assinante: sem isso a requisição segue viva depois de o componente ser
    // destruído, apesar dos `takeUntilDestroyed` a jusante.
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  byTicker = signal<MonthlyIncomeItem[]>([]);
  total = signal<number>(0);
  totalFromFridge = signal<number>(0);
  loading = signal(true);
  error = signal<string | null>(null);
  report = signal<MonthlyDividendReport | null>(null);
  reportLoading = signal(true);
  reportError = signal<string | null>(null);
  selectedYear = signal<number>(new Date().getFullYear());
  recording = signal(false);
  recordSuccess = signal<string | null>(null);
  recordError = signal<string | null>(null);
  dividendYield = signal<number>(0);
  /** Data de referência da agenda; sobrescrita nos testes. */
  today = signal<Date>(new Date());

  /**
   * O yield vem da coleção `dividends` (proventos registrados), enquanto a
   * projeção vem das cotações. Sem esse aviso, quem nunca registrou proventos
   * vê "Projeção: R$ 450,00" ao lado de "DY: 0,00%" e conclui que há defeito.
   */
  readonly yieldNeedsRecords = computed(
    () => this.dividendYield() === 0 && this.total() > 0,
  );
  readonly yearTotal = computed(() => this.report()?.total ?? 0);
  readonly monthlyAverage = computed(() => monthlyAverage(this.report()));
  readonly lastMonth = computed(() => lastMonthSummary(this.report()));
  readonly monthlySeries = computed(() =>
    // Mesma data de referência da agenda: o destaque do mês corrente e o
    // "hoje" dos pagamentos não podem divergir.
    buildMonthlySeries(this.report(), this.selectedYear(), this.today()),
  );
  readonly tickerConcentration = computed(() =>
    buildTickerConcentration(this.report()),
  );
  readonly schedule = computed(() =>
    buildPaymentSchedule(this.byTicker(), this.today()),
  );

  ngOnInit(): void {
    this.loadMonthlyIncome();
    this.loadDividendYield();
    this.loadReport(this.selectedYear());
  }

  private loadDividendYield(): void {
    this.wallets$
      .pipe(
        switchMap((wallets) =>
          wallets.length === 0
            ? of([])
            : forkJoin(
                wallets.map((wallet) =>
                  this.dividendService.getDividendYield(wallet.id),
                ),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (responses) => {
          this.dividendYield.set(aggregateDividendYield(responses).yield);
        },
        error: () => this.dividendYield.set(0),
      });
  }

  private loadMonthlyIncome(): void {
    this.wallets$
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

  recordMonthly(): void {
    this.recording.set(true);
    this.recordSuccess.set(null);
    this.recordError.set(null);

    this.dividendService
      .recordMonthlyDividends()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const currentYear = new Date().getFullYear();
          this.selectedYear.set(currentYear);
          this.recordSuccess.set(
            `Proventos de ${this.formatCurrentMonthYear()} registrados.`,
          );
          this.recording.set(false);
          this.loadReport(currentYear);
          // O registro alimenta a coleção `dividends`, que é a fonte do yield.
          this.loadDividendYield();
        },
        error: () => {
          this.recording.set(false);
          this.recordError.set('Erro ao registrar proventos do mês');
        },
      });
  }

  private formatCurrentMonthYear(): string {
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date());
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

  absolute(value: number): number {
    return Math.abs(value);
  }

  formatCurrency = formatCurrency;
  formatDate = formatDate;
  formatPercent = formatPercent;
}
