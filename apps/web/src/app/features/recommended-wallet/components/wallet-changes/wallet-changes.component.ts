import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import {
  Fridge,
  FridgeItem,
  Position,
  RecommendedWallet,
  RecommendedWalletChange,
  Wallet,
} from 'dindin-models';
import { FridgeService } from '../../../../core/services/fridge.service';
import { PositionService } from '../../../../core/services/position.service';
import { WalletService } from '../../../../core/services/wallet.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { Submission } from '../../../../shared/utils/submission.util';
import { UnfreezeFormComponent } from '../../../fridge/components/unfreeze-form/unfreeze-form.component';
import {
  MoveToFridgeFormComponent,
  MoveToFridgeValue,
} from '../../../wallet/components/move-to-fridge-form/move-to-fridge-form.component';

type WalletKey = 'renda' | 'ganho';

const WALLET_LABELS: Record<WalletKey, string> = {
  renda: 'Carteira Renda',
  ganho: 'Carteira Ganho',
};

interface Holdings {
  wallets: Wallet[];
  fridges: Fridge[];
  positions: Position[];
  items: FridgeItem[];
}

function allOf<T>(requests: Observable<T[]>[]): Observable<T[]> {
  return requests.length > 0
    ? forkJoin(requests).pipe(map((lists) => lists.flat()))
    : of([]);
}

/**
 * Quadro "Entra e sai do mês" (issue #586): o que o BB publica, cruzado com o
 * que o usuário tem. Mover e descongelar são sempre decisão dele.
 */
@Component({
  selector: 'app-wallet-changes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, MoveToFridgeFormComponent, UnfreezeFormComponent],
  templateUrl: './wallet-changes.component.html',
})
export class WalletChangesComponent {
  private readonly positionService = inject(PositionService);
  private readonly fridgeService = inject(FridgeService);
  private readonly walletService = inject(WalletService);
  private readonly destroyRef = inject(DestroyRef);

  readonly wallet = input.required<RecommendedWallet>();
  /** Só o mês mais recente: em um mês antigo a recomendação pode ter mudado. */
  readonly actionable = input(true);

  readonly moveSubmission = new Submission();
  readonly unfreezeSubmission = new Submission();

  readonly holdings = signal<Holdings | null>(null);
  readonly holdingsError = signal(false);
  readonly moving = signal<Position | null>(null);
  readonly unfreezing = signal<FridgeItem | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly sections = computed(() =>
    (['renda', 'ganho'] as const).map((key) => this.section(key)),
  );

  private readonly hasChanges = computed(() => {
    const changes = this.wallet().changes;
    return [changes?.renda, changes?.ganho].some(
      (change) => change && change.entering.length + change.leaving.length > 0,
    );
  });

  constructor() {
    effect(() => {
      if (this.hasChanges() && !untracked(this.holdings)) {
        untracked(() => this.loadHoldings());
      }
    });
  }

  walletName(walletId: string): string {
    return (
      this.holdings()?.wallets.find((wallet) => wallet.id === walletId)?.name ??
      ''
    );
  }

  openMove(position: Position): void {
    this.actionError.set(null);
    this.moving.set(position);
  }

  closeMove(): void {
    this.moving.set(null);
    this.actionError.set(null);
  }

  confirmMove(payload: MoveToFridgeValue): void {
    const position = this.moving();
    if (!position || !this.moveSubmission.start()) return;

    this.positionService
      .moveToFridge(position.walletId, position.id, payload)
      .pipe(
        finalize(() => this.moveSubmission.finish()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.closeMove();
          this.loadHoldings();
        },
        error: () =>
          this.actionError.set(
            'Erro ao mover posição para a geladeira. Tente novamente.',
          ),
      });
  }

  openUnfreeze(item: FridgeItem): void {
    this.actionError.set(null);
    this.unfreezing.set(item);
  }

  closeUnfreeze(): void {
    this.unfreezing.set(null);
    this.actionError.set(null);
  }

  confirmUnfreeze(walletId: string): void {
    const item = this.unfreezing();
    if (!item || !this.unfreezeSubmission.start()) return;

    this.fridgeService
      .unfreezeItem(item.fridgeId, item.id, walletId)
      .pipe(
        finalize(() => this.unfreezeSubmission.finish()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.closeUnfreeze();
          this.loadHoldings();
        },
        error: () => this.actionError.set('Erro ao descongelar item.'),
      });
  }

  private section(key: WalletKey) {
    const wallet = this.wallet();
    const change: RecommendedWalletChange | undefined = wallet.changes?.[key];
    const other: WalletKey = key === 'renda' ? 'ganho' : 'renda';
    const holdings = this.holdings();

    return {
      key,
      label: WALLET_LABELS[key],
      known: !!change,
      unchanged: !!change && !change.entering.length && !change.leaving.length,
      entering: (change?.entering ?? []).map((ticker) => ({
        ticker,
        items: (holdings?.items ?? []).filter((item) => item.ticker === ticker),
      })),
      leaving: (change?.leaving ?? []).map((ticker) => {
        // Trocar de carteira não é sair da recomendação.
        const stillIn = wallet[other].some((asset) => asset.ticker === ticker)
          ? WALLET_LABELS[other]
          : null;
        return {
          ticker,
          stillIn,
          positions: stillIn
            ? []
            : (holdings?.positions ?? []).filter(
                (position) => position.ticker === ticker && !position.inFridge,
              ),
        };
      }),
    };
  }

  private loadHoldings(): void {
    forkJoin({
      wallets: this.walletService.list(),
      fridges: this.fridgeService.listFridges(),
    })
      .pipe(
        switchMap(({ wallets, fridges }) =>
          forkJoin({
            positions: allOf(
              wallets.map((wallet) => this.positionService.list(wallet.id)),
            ),
            items: allOf(
              fridges.map((fridge) => this.fridgeService.listItems(fridge.id)),
            ),
          }).pipe(map((loaded) => ({ wallets, fridges, ...loaded }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (holdings) => {
          this.holdingsError.set(false);
          this.holdings.set(holdings);
        },
        error: () => this.holdingsError.set(true),
      });
  }
}
