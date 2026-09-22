import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, shareReplay, switchMap } from 'rxjs';
import {
  DividendService,
  MonthlyDividendReport,
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
} from '../../core/services/dividend.service';
import { WalletService } from '../../core/services/wallet.service';
import { buildMonthlySeries } from '../../shared/utils/monthly-series.util';
import { buildTickerConcentration } from '../../shared/utils/ticker-concentration.util';
import { buildPaymentSchedule } from '../../shared/utils/payment-schedule.util';
import { DividendKpisComponent } from './components/dividend-kpis/dividend-kpis.component';
import { PaymentScheduleComponent } from './components/payment-schedule/payment-schedule.component';
import {
  TickerCard,
  TickerProjectionComponent,
} from './components/ticker-projection/ticker-projection.component';
import { MonthlyReportComponent } from './components/monthly-report/monthly-report.component';
import { dividendTrend } from '../../shared/utils/dividend-trend.util';
import {
  aggregateDividendYield,
  lastMonthSummary,
  monthlyAverage,
} from '../../shared/utils/dividend-kpi.util';

@Component({
  selector: 'app-dividend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DividendKpisComponent,
    PaymentScheduleComponent,
    TickerProjectionComponent,
    MonthlyReportComponent,
  ],
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

  /**
   * Renda consolidada de todas as carteiras. O recorte gratuito (#262) vem
   * pronto da API, sobre o agregado — antes a tela reaplicava a regra no
   * cliente, sobre uma resposta por carteira (issue #300).
   */
  private readonly income = signal<MonthlyIncomeResponse | null>(null);
  readonly byTicker = computed<MonthlyIncomeItem[]>(
    () => this.income()?.byTicker ?? [],
  );
  readonly hiddenCount = computed(
    () => this.income()?.hiddenTickers?.length ?? 0,
  );
  readonly hiddenScheduleCount = computed(
    () => this.income()?.hiddenPaymentDates?.length ?? 0,
  );
  readonly hiddenWithoutDateCount = computed(
    () => this.income()?.hiddenScheduleTickers?.length ?? 0,
  );
  total = signal<number>(0);
  totalFromFridge = signal<number>(0);
  loading = signal(true);
  error = signal<string | null>(null);
  report = signal<MonthlyDividendReport | null>(null);
  reportLoading = signal(true);
  reportError = signal<string | null>(null);
  selectedYear = signal<number>(new Date().getFullYear());
  dividendYield = signal<number>(0);
  /** Data de referência da agenda; sobrescrita nos testes. */
  today = signal<Date>(new Date());
  /** Provento por cota ao longo do tempo, por ticker. */
  history = signal<Record<string, number[]>>({});

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
  /**
   * Com recorte, a agenda parte dos itens das datas liberadas — e não do
   * `byTicker`, que segue outro corte —, mas os totais continuam os da API,
   * calculados sobre todos os ativos.
   */
  readonly schedule = computed(() => {
    const income = this.income();
    const limited = income?.limited === true;
    const schedule = buildPaymentSchedule(
      limited ? (income?.scheduleItems ?? []) : this.byTicker(),
      this.today(),
    );
    return limited && income?.scheduleTotals
      ? {
          ...schedule,
          upcomingTotal: income.scheduleTotals.upcomingTotal,
          paidTotal: income.scheduleTotals.paidTotal,
        }
      : schedule;
  });
  readonly cards = computed<TickerCard[]>(() => {
    const history = this.history();
    return this.byTicker().map((item) => {
      const values = history[item.ticker] ?? [];
      return { item, history: values, trend: dividendTrend(values) };
    });
  });

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
    this.dividendService
      .getConsolidatedMonthlyIncome()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.income.set(response);
          this.total.set(response.total);
          this.totalFromFridge.set(response.totalFromFridge);
          this.loading.set(false);
          this.loadHistories(this.byTicker());
        },
        error: () => {
          this.error.set('Erro ao carregar proventos');
          this.loading.set(false);
        },
      });
  }

  /**
   * Carrega o histórico de cada ticker em paralelo, sem bloquear a exibição
   * dos cards: uma falha isolada apenas deixa aquele card sem sparkline.
   */
  private loadHistories(items: MonthlyIncomeItem[]): void {
    const tickers = items.map((item) => item.ticker);
    if (tickers.length === 0) {
      return;
    }

    this.dividendService
      .getDividendHistoryBatch(tickers)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.history.set(
            Object.fromEntries(
              Object.entries(response.byTicker).map(([ticker, entries]) => [
                ticker,
                entries.map((entry) => entry.monthlyDividend),
              ]),
            ),
          );
        },
        error: () => {
          // Cards seguem renderizados sem o gráfico de histórico.
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
}
