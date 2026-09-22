import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AiSuggestion,
  AiSuggestionAppliedItem,
  AiSuggestionFallbackAllocation,
  AiSuggestionItem,
} from 'dindin-models';
import {
  formatCurrency,
  parseBrlNumber,
} from '../../../../shared/utils/format.util';
import { LucideSparkles, LucideWallet } from '@lucide/angular';

export interface GenerateRequest {
  /** `undefined` quando o usuário não informou aporte. */
  contribution: number | undefined;
  force: boolean;
}

export interface ApplyRequest {
  item: AiSuggestionItem;
  /** Presente quando a compra é uma alternativa de redistribuição. */
  alternative?: AiSuggestionFallbackAllocation;
}

/**
 * Painel da sugestão do mês (issue #310).
 *
 * Reúne o aporte, o paywall e a lista de itens com as alternativas de
 * redistribuição (#276). O aporte é validado aqui, onde é digitado; o
 * `recommended-wallet.component` recebe o valor já convertido e chama a API.
 */
@Component({
  selector: 'app-ai-suggestion-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LucideSparkles, LucideWallet],
  templateUrl: './ai-suggestion-panel.component.html',
})
export class AiSuggestionPanelComponent {
  readonly suggestion = input<AiSuggestion | null>(null);
  readonly loading = input(false);
  /** Falha vinda do pai (API). */
  readonly error = input<string | null>(null);
  readonly hasAiAccess = input(false);
  readonly showPaywall = input(false);
  /** Só há o que gerar com carteira e mês escolhidos. */
  readonly canGenerate = input(false);

  readonly generate = output<GenerateRequest>();
  readonly apply = output<ApplyRequest>();

  readonly contributionInput = signal('');

  /** Aporte digitado em formato inválido: erro do próprio painel. */
  private readonly localError = signal<string | null>(null);
  readonly shownError = computed(() => this.error() ?? this.localError());

  onContributionInput(event: Event): void {
    this.contributionInput.set((event.target as HTMLInputElement).value);
  }

  requestGeneration(force = false): void {
    const raw = this.contributionInput().trim();
    const contribution = raw === '' ? undefined : parseBrlNumber(raw);

    if (
      contribution === null ||
      (contribution !== undefined && contribution < 0)
    ) {
      this.localError.set('Informe um valor de aporte válido.');
      return;
    }

    this.localError.set(null);
    this.generate.emit({ contribution, force });
  }

  requestApply(
    item: AiSuggestionItem,
    alternative?: AiSuggestionFallbackAllocation,
  ): void {
    this.apply.emit(alternative ? { item, alternative } : { item });
  }

  actionLabel(action: AiSuggestionItem['action']): string {
    if (action === 'buy') return 'Comprar';
    if (action === 'reduce') return 'Reduzir';
    return 'Manter';
  }

  /** Compra cujo valor sugerido não dá nem uma cota. */
  isUnaffordable(item: AiSuggestionItem): boolean {
    return item.action === 'buy' && item.suggestedQuantity === 0;
  }

  quantityLabel(quantity: number): string {
    return quantity === 1 ? 'cota' : 'cotas';
  }

  appliedEntry(
    ticker: string,
    fallbackFor?: string,
  ): AiSuggestionAppliedItem | null {
    return (
      this.suggestion()?.appliedItems?.find(
        (applied) =>
          applied.ticker.toUpperCase() === ticker.toUpperCase() &&
          applied.fallbackFor?.toUpperCase() === fallbackFor?.toUpperCase(),
      ) ?? null
    );
  }

  formatCurrency = formatCurrency;
}
