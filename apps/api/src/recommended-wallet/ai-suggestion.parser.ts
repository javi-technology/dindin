import { logError, logWarn } from '../shared/logger';
import {
  AiSuggestionItem,
  AiSuggestionTab,
  RecommendedWalletComparisonItem,
} from 'dindin-models';

/**
 * Parser da saída do modelo (issue #306).
 *
 * O JSON que volta da OpenRouter é texto não confiável: pode vir embrulhado
 * em markdown, com campo faltando ou com tipo errado. Este módulo valida e
 * normaliza antes de qualquer regra de negócio tocar no conteúdo.
 */

const DEFAULT_DISCLAIMER = 'Este conteúdo não é recomendação de investimento.';

export function isTab(value: unknown): value is AiSuggestionTab {
  return value === 'renda' || value === 'ganho';
}

function isValidItem(value: unknown): value is AiSuggestionItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const priority =
    typeof item.priority === 'string' ? Number(item.priority) : item.priority;
  if (typeof item.priority === 'string') item.priority = priority;
  if (item.suggestedAmount === null) delete item.suggestedAmount;
  if (Array.isArray(item.fallbackAllocations)) {
    const fallbackAllocations = item.fallbackAllocations.filter(
      (allocation) => {
        if (!allocation || typeof allocation !== 'object') return false;
        const candidate = allocation as Record<string, unknown>;
        return (
          typeof candidate.ticker === 'string' &&
          candidate.ticker.length > 0 &&
          typeof candidate.amount === 'number' &&
          Number.isFinite(candidate.amount) &&
          candidate.amount > 0
        );
      },
    );
    if (fallbackAllocations.length > 0) {
      item.fallbackAllocations = fallbackAllocations;
    } else {
      delete item.fallbackAllocations;
    }
  } else if (item.fallbackAllocations !== undefined) {
    delete item.fallbackAllocations;
  }
  return (
    typeof item.ticker === 'string' &&
    item.ticker.length > 0 &&
    (item.action === 'buy' ||
      item.action === 'hold' ||
      item.action === 'reduce') &&
    typeof priority === 'number' &&
    Number.isInteger(priority) &&
    priority >= 1 &&
    typeof item.rationale === 'string' &&
    (item.suggestedAmount === undefined ||
      (typeof item.suggestedAmount === 'number' &&
        Number.isFinite(item.suggestedAmount) &&
        item.suggestedAmount >= 0))
  );
}

export function parseSuggestionOutput(
  raw: string,
  allowed: Map<string, RecommendedWalletComparisonItem['status']>,
  totalAvailable?: number,
): { summary: string; items: AiSuggestionItem[]; disclaimer: string } {
  try {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fenced?.[1] ?? trimmed);
    } catch {
      throw new Error('JSON inválido');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Resposta não é um objeto');
    }
    const data = parsed as Record<string, unknown>;
    if (typeof data.summary !== 'string') {
      throw new Error('Resumo ausente ou inválido');
    }
    if (!Array.isArray(data.items)) {
      throw new Error('Itens ausentes ou inválidos');
    }
    const validItems = (data.items as unknown[]).filter(isValidItem);
    if (validItems.length === 0) {
      throw new Error('Nenhum item válido');
    }
    const normalizedAllowed = new Map(
      [...allowed.entries()].map(([ticker, status]) => [
        ticker.toUpperCase(),
        status,
      ]),
    );
    const items = validItems
      .filter((item) => normalizedAllowed.has(item.ticker.toUpperCase()))
      .sort((a, b) => a.priority - b.priority);
    if (items.length === 0) {
      throw new Error('Nenhum item permitido');
    }
    let normalizedItems = items.map((item) => {
      const fallbackAllocations = item.fallbackAllocations
        ?.filter((allocation) => {
          const ticker = allocation.ticker.toUpperCase();
          return (
            normalizedAllowed.has(ticker) &&
            normalizedAllowed.get(ticker) !== 'extra' &&
            ticker !== item.ticker.toUpperCase()
          );
        })
        .map((allocation) => ({
          ...allocation,
          ticker: allocation.ticker,
        }));
      let normalizedItem: AiSuggestionItem;
      if (fallbackAllocations?.length) {
        normalizedItem = { ...item, fallbackAllocations };
      } else {
        const {
          fallbackAllocations: _fallbackAllocations,
          ...withoutFallback
        } = item;
        normalizedItem = withoutFallback;
      }
      if (
        normalizedAllowed.get(item.ticker.toUpperCase()) === 'extra' &&
        item.action === 'buy'
      ) {
        const { suggestedAmount: _suggestedAmount, ...itemWithoutAmount } =
          normalizedItem;
        logWarn('parseSuggestionOutput.extraConverted', {
          ticker: item.ticker,
        });
        return { ...itemWithoutAmount, action: 'hold' as const };
      }
      return normalizedItem;
    });
    if (totalAvailable !== undefined) {
      const buyTotal = normalizedItems
        .filter((item) => item.action === 'buy')
        .reduce((total, item) => total + (item.suggestedAmount ?? 0), 0);
      if (buyTotal > totalAvailable * 1.01) {
        const ratio = buyTotal === 0 ? 0 : totalAvailable / buyTotal;
        const amounts = normalizedItems
          .filter(
            (item) =>
              item.action === 'buy' && typeof item.suggestedAmount === 'number',
          )
          .map((item) => {
            const suggestedAmount = item.suggestedAmount as number;
            const normalizedAmount =
              Math.round(suggestedAmount * ratio * 100) / 100;
            return {
              ticker: item.ticker,
              from: suggestedAmount,
              to: normalizedAmount,
            };
          });
        logWarn('parseSuggestionOutput.amountsAdjusted', { amounts });
        normalizedItems = normalizedItems.map((item) => {
          if (
            item.action !== 'buy' ||
            typeof item.suggestedAmount !== 'number'
          ) {
            return item;
          }
          return {
            ...item,
            suggestedAmount:
              Math.round(item.suggestedAmount * ratio * 100) / 100,
            ...(item.fallbackAllocations?.length
              ? {
                  fallbackAllocations: item.fallbackAllocations.map(
                    (allocation) => ({
                      ...allocation,
                      amount: Math.round(allocation.amount * ratio * 100) / 100,
                    }),
                  ),
                }
              : {}),
          };
        });
      }
    }
    return {
      summary: data.summary,
      items: normalizedItems,
      disclaimer:
        typeof data.disclaimer === 'string'
          ? data.disclaimer
          : DEFAULT_DISCLAIMER,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Erro desconhecido';
    logError('parseSuggestionOutput.invalidResponse', {
      reason,
      snippet: raw.slice(0, 500),
    });
    throw new Error('Resposta inválida da IA');
  }
}
