import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { FridgeItem, Position, Wallet } from 'dindin-models';
import {
  LucideRefrigerator,
  LucideTrendingUp,
  LucideWallet,
} from '@lucide/angular';
import { WalletService } from '../../core/services/wallet.service';
import { PositionService } from '../../core/services/position.service';
import { FridgeService } from '../../core/services/fridge.service';
import { DividendService } from '../../core/services/dividend.service';
import { AuthService } from '../../core/services/auth.service';
import { HealthService } from '../../core/services/health.service';
import { formatCurrency } from '../../shared/utils/format.util';
import { aggregateMonthlyIncome } from '../../shared/utils/monthly-income.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, LucideWallet, LucideRefrigerator, LucideTrendingUp],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly walletService = inject(WalletService);
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly dividendService = inject(DividendService);
  private readonly authService = inject(AuthService);
  private readonly healthService = inject(HealthService);
  private readonly destroyRef = inject(DestroyRef);

  totalWallet = signal(0);
  totalFridge = signal(0);
  totalDividends = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  isAdmin = signal(false);
  backendOnline = signal(false);

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

  private loadSummary(): void {
    this.walletService
      .list()
      .pipe(
        switchMap((wallets) =>
          forkJoin({
            totalWallet: this.walletTotal(wallets),
            totalFridge: this.fridgeTotal(),
            totalDividends: this.dividendsTotal(wallets),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ totalWallet, totalFridge, totalDividends }) => {
          this.totalWallet.set(totalWallet);
          this.totalFridge.set(totalFridge);
          this.totalDividends.set(totalDividends);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Erro ao carregar resumo do dashboard.');
          this.loading.set(false);
        },
      });
  }

  private walletTotal(wallets: Wallet[]): Observable<number> {
    return this.combine(
      wallets.map((wallet) => this.positionService.list(wallet.id)),
    ).pipe(
      map((positions) =>
        positions.reduce(
          (sum, position) =>
            sum + position.quantity * this.positionPrice(position),
          0,
        ),
      ),
    );
  }

  private dividendsTotal(wallets: Wallet[]): Observable<number> {
    if (wallets.length === 0) {
      return of(0);
    }

    return forkJoin(
      wallets.map((wallet) => this.dividendService.getMonthlyIncome(wallet.id)),
    ).pipe(map((responses) => aggregateMonthlyIncome(responses).total));
  }

  private fridgeTotal(): Observable<number> {
    return this.fridgeService.listFridges().pipe(
      switchMap((fridges) =>
        this.combine(
          fridges.map((fridge) => this.fridgeService.listItems(fridge.id)),
        ),
      ),
      map((items) =>
        items.reduce(
          (sum, item) => sum + item.quantity * this.itemPrice(item),
          0,
        ),
      ),
    );
  }

  private combine<T>(requests: Observable<T[]>[]): Observable<T[]> {
    if (requests.length === 0) {
      return of([]);
    }
    return forkJoin(requests).pipe(map((results) => results.flat()));
  }

  private positionPrice(position: Position): number {
    return position.currentPrice ?? position.averagePrice;
  }

  private itemPrice(item: FridgeItem): number {
    return item.currentPrice ?? item.transferredPrice;
  }
}
