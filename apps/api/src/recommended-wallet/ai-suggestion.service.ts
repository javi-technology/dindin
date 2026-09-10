import * as admin from 'firebase-admin';
import {
  AiSuggestion,
  AiSuggestionItem,
  AiSuggestionTab,
  RecommendedWallet,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
} from 'dindin-models';
import {
  compareWithWallet,
  getQuotePrices,
  getRecommendedWallet,
} from './recommended-wallet.service';
import { listQualifiedInvestorTickers } from '../assets/asset.service';
import { buildUserPrompt, SYSTEM_PROMPT } from './ai-suggestion.prompt';
import { computeMonthlyIncome } from '../dividend/monthly-income.service';

export interface AiSuggestionInputItem extends RecommendedWalletComparisonItem {
  segment?: string;
  weight?: number;
  closePrice?: number;
  monthlyDividend?: number;
  qualifiedInvestor?: boolean;
}

export interface AiSuggestionHistoryAsset {
  ticker: string;
  weight: number;
  segment: string;
}

export interface AiSuggestionHistoryMonth {
  month: string;
  assets: AiSuggestionHistoryAsset[];
}

export interface AiSuggestionInput {
  month: string;
  tab: AiSuggestionTab;
  totalValue: number;
  contribution?: number;
  projectedDividends: number;
  items: AiSuggestionInputItem[];
  history: AiSuggestionHistoryMonth[];
}

const DEFAULT_DISCLAIMER = 'Este conteúdo não é recomendação de investimento.';
export const OPENROUTER_TIMEOUT_MS = 120_000;
export const DAILY_SUGGESTION_LIMIT = 5;

type StatusError = Error & { statusCode?: number };

function createError(message: string, statusCode: number): StatusError {
  return Object.assign(new Error(message), { statusCode });
}

function suggestionsCollection(uid: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('aiSuggestions');
}

function usageCollection(uid: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('aiSuggestionUsage');
}

function isTab(value: unknown): value is AiSuggestionTab {
  return value === 'renda' || value === 'ganho';
}

export function previousMonths(month: string, count = 3): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return Array.from({ length: count }, () => {
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  });
}

export function buildSuggestionHistory(
  wallets: RecommendedWallet[],
  tab: AiSuggestionTab,
): AiSuggestionHistoryMonth[] {
  return wallets
    .map((wallet) => ({
      month: wallet.month,
      assets: wallet[tab].map(({ ticker, weight, segment }) => ({
        ticker,
        weight,
        segment,
      })),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function buildSuggestionInput(
  comparison: RecommendedWalletComparison,
  tab: AiSuggestionTab,
  quotesByTicker: Map<string, number>,
  contribution?: number,
  history: AiSuggestionHistoryMonth[] = [],
  projectedDividendsOverride?: number,
  qualifiedTickers: Set<string> = new Set(),
): AiSuggestionInput {
  const assets = new Map(
    comparison.recommended[tab].map((asset) => [
      asset.ticker.toUpperCase(),
      asset,
    ]),
  );
  const items = comparison.items.map((item) => {
    const asset = assets.get(item.ticker.toUpperCase());
    const monthlyDividend = quotesByTicker.get(item.ticker.toUpperCase());
    const qualifiedInvestor = qualifiedTickers.has(item.ticker.toUpperCase());
    return {
      ...item,
      ...(asset
        ? {
            segment: asset.segment,
            weight: asset.weight,
            closePrice: asset.closePrice,
          }
        : {}),
      ...(monthlyDividend === undefined ? {} : { monthlyDividend }),
      ...(qualifiedInvestor ? { qualifiedInvestor: true } : {}),
    };
  });
  const projectedDividends =
    projectedDividendsOverride ??
    items.reduce(
      (total, item) => total + item.quantity * (item.monthlyDividend ?? 0),
      0,
    );
  return {
    month: comparison.recommended.month,
    tab,
    totalValue: comparison.totalValue,
    ...(contribution === undefined ? {} : { contribution }),
    projectedDividends,
    items,
    history,
  };
}

export function applySuggestedQuantities(
  items: AiSuggestionItem[],
  priceByTicker: Map<string, number>,
): AiSuggestionItem[] {
  return items.map((item) => {
    const suggestedAmount = item.suggestedAmount;
    const price = priceByTicker.get(item.ticker.toUpperCase());
    if (
      typeof suggestedAmount !== 'number' ||
      !Number.isFinite(suggestedAmount) ||
      suggestedAmount <= 0 ||
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return item;
    }
    return {
      ...item,
      referencePrice: price,
      suggestedQuantity: Math.floor(suggestedAmount / price),
    };
  });
}

export function redistributeUnspentAmounts(
  items: AiSuggestionItem[],
  priceByTicker: Map<string, number>,
  totalAvailable: number,
  qualifiedTickers: Set<string>,
  allowed: Map<string, RecommendedWalletComparisonItem['status']>,
): AiSuggestionItem[] {
  const normalizedQualifiedTickers = new Set(
    [...qualifiedTickers].map((ticker) => ticker.toUpperCase()),
  );
  const roundAmount = (amount: number) => Math.round(amount * 100) / 100;
  const states = items
    .map((item, index) => {
      if (item.action !== 'buy') return null;
      const ticker = item.ticker.toUpperCase();
      const price = priceByTicker.get(ticker);
      const hasKnownPrice =
        typeof price === 'number' && Number.isFinite(price) && price > 0;
      const isQualified = normalizedQualifiedTickers.has(ticker);
      const status = allowed.get(ticker);
      const quantity =
        typeof item.suggestedQuantity === 'number' &&
        Number.isFinite(item.suggestedQuantity) &&
        item.suggestedQuantity >= 0
          ? item.suggestedQuantity
          : 0;
      if (!hasKnownPrice || isQualified || status === 'extra') {
        return {
          kind: 'fixed' as const,
          amount:
            status !== 'extra' &&
            typeof item.suggestedAmount === 'number' &&
            Number.isFinite(item.suggestedAmount)
              ? item.suggestedAmount
              : 0,
        };
      }
      return {
        kind: 'eligible' as const,
        index,
        item,
        price,
        quantity,
        originalQuantity: quantity,
      };
    })
    .filter(
      (
        state,
      ): state is
        | { kind: 'fixed'; amount: number }
        | {
            kind: 'eligible';
            index: number;
            item: AiSuggestionItem;
            price: number;
            quantity: number;
            originalQuantity: number;
          } => state !== null,
    );
  const fixedSpent = states
    .filter(
      (state): state is { kind: 'fixed'; amount: number } =>
        state.kind === 'fixed',
    )
    .reduce((total, state) => total + state.amount, 0);
  const eligibleStates = states.filter(
    (
      state,
    ): state is {
      kind: 'eligible';
      index: number;
      item: AiSuggestionItem;
      price: number;
      quantity: number;
      originalQuantity: number;
    } => state.kind === 'eligible',
  );
  const eligibleSpent = eligibleStates.reduce(
    (total, state) => total + state.quantity * state.price,
    0,
  );
  let pool = roundAmount(totalAvailable - fixedSpent - eligibleSpent);
  if (pool <= 0) return items;

  let changed = true;
  while (changed) {
    changed = false;
    const orderedStates = [...eligibleStates].sort(
      (a, b) =>
        Number(a.quantity > 0) - Number(b.quantity > 0) ||
        a.item.priority - b.item.priority ||
        a.index - b.index,
    );
    for (const state of orderedStates) {
      if (pool + 1e-9 < state.price) continue;
      state.quantity += 1;
      pool = roundAmount(pool - state.price);
      changed = true;
    }
  }

  const updatedByIndex = new Map<number, AiSuggestionItem>();
  for (const state of eligibleStates) {
    if (state.quantity > 0) {
      const quantityIncreased = state.quantity > state.originalQuantity;
      updatedByIndex.set(state.index, {
        ...state.item,
        suggestedAmount: roundAmount(state.quantity * state.price),
        suggestedQuantity: state.quantity,
        referencePrice: state.price,
        ...(quantityIncreased
          ? {
              rationale: `${state.item.rationale} Recebe cotas adicionais com o saldo realocado de ativos sem cota inteira.`,
            }
          : {}),
      });
    } else {
      const {
        suggestedAmount: _suggestedAmount,
        suggestedQuantity: _suggestedQuantity,
        referencePrice: _referencePrice,
        ...withoutQuantities
      } = state.item;
      updatedByIndex.set(state.index, {
        ...withoutQuantities,
        action: 'hold',
        rationale: `${state.item.rationale} Valor realocado para outros ativos por não completar 1 cota.`,
      });
    }
  }
  return items.map((item, index) => updatedByIndex.get(index) ?? item);
}

export function applyQualifiedInvestor(
  items: AiSuggestionItem[],
  qualifiedTickers: Set<string>,
): AiSuggestionItem[] {
  return items.map((item) => {
    const { qualifiedInvestor: _qualifiedInvestor, ...withoutFlag } = item;
    return qualifiedTickers.has(item.ticker.toUpperCase())
      ? { ...withoutFlag, qualifiedInvestor: true }
      : withoutFlag;
  });
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
        console.warn(
          '[parseSuggestionOutput] compra em item extra convertida',
          {
            ticker: item.ticker,
          },
        );
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
        console.warn(
          '[parseSuggestionOutput] compras ajustadas ao total disponível',
          { amounts },
        );
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
    console.error('[parseSuggestionOutput] resposta inválida', {
      reason,
      snippet: raw.slice(0, 500),
    });
    throw new Error('Resposta inválida da IA');
  }
}

export function applyFallbackAllocations(
  items: AiSuggestionItem[],
  qualifiedTickers: Set<string>,
  comparisonItems: RecommendedWalletComparisonItem[],
  priceByTicker: Map<string, number>,
): AiSuggestionItem[] {
  const normalizedQualifiedTickers = new Set(
    [...qualifiedTickers].map((ticker) => ticker.toUpperCase()),
  );
  const comparisonByTicker = new Map(
    comparisonItems.map((comparisonItem) => [
      comparisonItem.ticker.toUpperCase(),
      comparisonItem,
    ]),
  );
  const roundAmount = (amount: number): number =>
    Math.round(amount * 100) / 100;
  const withQuantities = (
    allocations: Array<{ ticker: string; amount: number }>,
  ) =>
    allocations.map((allocation) => {
      const ticker = allocation.ticker.toUpperCase();
      const price = priceByTicker.get(ticker);
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ticker, amount: allocation.amount };
      }
      return {
        ticker,
        amount: allocation.amount,
        referencePrice: price,
        suggestedQuantity: Math.floor(allocation.amount / price),
      };
    });
  const normalizeAmounts = (
    allocations: Array<{ ticker: string; amount: number }>,
    total: number,
  ) => {
    if (allocations.length === 0) return allocations;
    const sum = allocations.reduce(
      (allocationTotal, allocation) => allocationTotal + allocation.amount,
      0,
    );
    if (sum === 0) return allocations;
    const normalized = allocations.map((allocation) => ({
      ticker: allocation.ticker,
      amount: roundAmount((allocation.amount / sum) * total),
    }));
    const difference = roundAmount(
      total -
        normalized.reduce((value, allocation) => value + allocation.amount, 0),
    );
    if (difference !== 0) {
      normalized[normalized.length - 1].amount = roundAmount(
        normalized[normalized.length - 1].amount + difference,
      );
    }
    return normalized;
  };
  const getCandidates = (ticker: string) =>
    comparisonItems.filter((comparisonItem) => {
      const candidateTicker = comparisonItem.ticker.toUpperCase();
      return (
        comparisonItem.status !== 'extra' &&
        !normalizedQualifiedTickers.has(candidateTicker) &&
        candidateTicker !== ticker
      );
    });

  return items.map((item) => {
    const ticker = item.ticker.toUpperCase();
    const isQualified = normalizedQualifiedTickers.has(ticker);
    const suggestedAmount = item.suggestedAmount;
    if (
      !isQualified ||
      item.action !== 'buy' ||
      typeof suggestedAmount !== 'number' ||
      !Number.isFinite(suggestedAmount) ||
      suggestedAmount <= 0
    ) {
      const { fallbackAllocations: _fallbackAllocations, ...withoutFallback } =
        item;
      return withoutFallback;
    }

    const validAllocations = (item.fallbackAllocations ?? [])
      .filter(
        (allocation) =>
          typeof allocation.ticker === 'string' &&
          allocation.ticker.length > 0 &&
          typeof allocation.amount === 'number' &&
          Number.isFinite(allocation.amount) &&
          allocation.amount > 0,
      )
      .map((allocation) => ({
        ticker: allocation.ticker.toUpperCase(),
        amount: allocation.amount,
      }))
      .filter((allocation) => {
        const comparisonItem = comparisonByTicker.get(allocation.ticker);
        return (
          comparisonItem !== undefined &&
          comparisonItem.status !== 'extra' &&
          !normalizedQualifiedTickers.has(allocation.ticker) &&
          allocation.ticker !== ticker
        );
      });
    const allocationTotal = validAllocations.reduce(
      (total, allocation) => total + allocation.amount,
      0,
    );
    const candidates = getCandidates(ticker);
    let allocations = validAllocations;
    if (allocationTotal === 0) {
      if (candidates.length === 0) {
        const {
          fallbackAllocations: _fallbackAllocations,
          ...withoutFallback
        } = item;
        return withoutFallback;
      }
      const weights = candidates.map((candidate) =>
        typeof candidate.recommendedWeight === 'number' &&
        Number.isFinite(candidate.recommendedWeight) &&
        candidate.recommendedWeight > 0
          ? candidate.recommendedWeight
          : 0,
      );
      const weightTotal = weights.reduce((total, weight) => total + weight, 0);
      allocations = candidates.map((candidate, index) => ({
        ticker: candidate.ticker.toUpperCase(),
        amount:
          weightTotal > 0
            ? roundAmount((suggestedAmount * weights[index]) / weightTotal)
            : roundAmount(suggestedAmount / candidates.length),
      }));
      allocations = normalizeAmounts(allocations, suggestedAmount);
    } else if (
      Math.abs(allocationTotal - suggestedAmount) >
      suggestedAmount * 0.01
    ) {
      allocations = normalizeAmounts(validAllocations, suggestedAmount);
    }
    while (allocations.length > 0) {
      const affordableAllocations = allocations.filter((allocation) => {
        const price = priceByTicker.get(allocation.ticker);
        return !(
          typeof price === 'number' &&
          Number.isFinite(price) &&
          price > 0 &&
          Math.floor(allocation.amount / price) === 0
        );
      });
      if (affordableAllocations.length === allocations.length) break;
      allocations = normalizeAmounts(affordableAllocations, suggestedAmount);
    }
    if (allocations.length === 0) {
      const cheapestCandidate = candidates
        .map((candidate) => {
          const candidateTicker = candidate.ticker.toUpperCase();
          const price = priceByTicker.get(candidateTicker);
          return { ticker: candidateTicker, price };
        })
        .filter(
          (candidate): candidate is { ticker: string; price: number } =>
            typeof candidate.price === 'number' &&
            Number.isFinite(candidate.price) &&
            candidate.price > 0,
        )
        .sort((a, b) => a.price - b.price)[0];
      if (
        !cheapestCandidate ||
        Math.floor(suggestedAmount / cheapestCandidate.price) === 0
      ) {
        const {
          fallbackAllocations: _fallbackAllocations,
          ...withoutFallback
        } = item;
        return withoutFallback;
      }
      allocations = [
        { ticker: cheapestCandidate.ticker, amount: suggestedAmount },
      ];
    }
    return {
      ...item,
      fallbackAllocations: withQuantities(allocations),
    };
  });
}

export async function callOpenRouter(
  system: string,
  user: string,
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw createError('OPENROUTER_API_KEY não configurada', 500);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  const requestBody = {
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-5.6-luna',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const request = (body: object) =>
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  const logResponseError = async (response: Response): Promise<void> => {
    const body =
      typeof response.text === 'function' ? await response.text() : '';
    const safeBody = body.split(apiKey).join('[redacted]').slice(0, 500);
    console.error(
      '[callOpenRouter] OpenRouter respondeu',
      response.status,
      safeBody,
    );
  };
  try {
    let response = await request(requestBody);
    if (!response.ok) {
      await logResponseError(response);
      const { response_format: _responseFormat, ...retryBody } = requestBody;
      response = await request(retryBody);
      if (!response.ok) {
        await logResponseError(response);
        throw createError('Falha ao consultar o provedor de IA', 502);
      }
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as { model?: unknown }).model !== 'string' ||
      !Array.isArray((data as { choices?: unknown }).choices) ||
      typeof (data as { choices: Array<{ message?: { content?: unknown } }> })
        .choices[0]?.message?.content !== 'string'
    ) {
      const serialized = JSON.stringify(data) ?? String(data);
      console.error(
        '[callOpenRouter] resposta inesperada',
        serialized.slice(0, 500),
      );
      throw createError('Falha ao consultar o provedor de IA', 502);
    }
    const result = data as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    return { content: result.choices[0].message.content, model: result.model };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as StatusError).statusCode === 502
    ) {
      throw error;
    }
    console.error('[callOpenRouter] falha', error);
    throw createError('Falha ao consultar o provedor de IA', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkDailyLimit(uid: string): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const snapshot = await usageCollection(uid)
    .where('createdAt', '>=', startOfToday.toISOString())
    .get();
  if (snapshot.size >= DAILY_SUGGESTION_LIMIT) {
    throw createError('Limite diário de sugestões atingido', 429);
  }
}

export function suggestionId(
  walletId: string,
  month: string,
  tab: AiSuggestionTab,
): string {
  return `${walletId}_${month}_${tab}`;
}

export async function getSavedSuggestion(
  uid: string,
  walletId: string,
  month: string,
  tab: AiSuggestionTab,
): Promise<AiSuggestion | null> {
  const id = suggestionId(walletId, month, tab);
  const doc = await suggestionsCollection(uid).doc(id).get();
  if (!doc.exists) return null;
  const { input: _input, ...data } = doc.data() as AiSuggestion & {
    input?: AiSuggestionInput;
  };
  return { ...data, id: doc.id };
}

export async function generateSuggestion(
  uid: string,
  walletId: string,
  month: string,
  tab: AiSuggestionTab,
  force: boolean,
  contribution?: number,
): Promise<AiSuggestion> {
  if (!isTab(tab)) throw createError('Aba inválida', 400);
  const comparison = await compareWithWallet(uid, walletId, month, tab);
  const historyMonths = previousMonths(comparison.recommended.month);
  const historyWallets = (
    await Promise.all(historyMonths.map((item) => getRecommendedWallet(item)))
  ).filter((wallet): wallet is RecommendedWallet => wallet !== null);
  const sortedHistoryWallets = historyWallets.sort((a, b) =>
    b.month.localeCompare(a.month),
  );
  const history = buildSuggestionHistory(sortedHistoryWallets, tab);
  const availableHistoryMonths = sortedHistoryWallets.map(
    (wallet) => `${wallet.month}:${wallet.revision}`,
  );
  if (!force) {
    const saved = await getSavedSuggestion(uid, walletId, month, tab);
    if (
      saved &&
      saved.contribution === contribution &&
      JSON.stringify(saved.historyMonths ?? []) ===
        JSON.stringify(availableHistoryMonths)
    ) {
      return saved;
    }
  }
  await checkDailyLimit(uid);
  const [income, quotePrices, qualifiedTickers] = await Promise.all([
    computeMonthlyIncome(uid, walletId),
    getQuotePrices(),
    listQualifiedInvestorTickers(),
  ]);
  const input = buildSuggestionInput(
    comparison,
    tab,
    income.monthlyDividendByTicker,
    contribution,
    history,
    income.total,
    qualifiedTickers,
  );
  const allowed = new Map(
    comparison.items.map((item) => [item.ticker.toUpperCase(), item.status]),
  );
  const totalAvailable =
    contribution === undefined
      ? undefined
      : contribution + input.projectedDividends;
  const { content, model } = await callOpenRouter(
    SYSTEM_PROMPT,
    buildUserPrompt(input),
  );
  const output = parseSuggestionOutput(content, allowed, totalAvailable);
  const priceByTicker = new Map(quotePrices);
  for (const asset of comparison.recommended[tab]) {
    const ticker = asset.ticker.toUpperCase();
    if (
      !priceByTicker.has(ticker) &&
      typeof asset.closePrice === 'number' &&
      Number.isFinite(asset.closePrice) &&
      asset.closePrice > 0
    ) {
      priceByTicker.set(ticker, asset.closePrice);
    }
  }
  const id = suggestionId(walletId, month, tab);
  const createdAt = new Date().toISOString();
  const withQuantities = applySuggestedQuantities(output.items, priceByTicker);
  const rebalanced =
    totalAvailable === undefined
      ? withQuantities
      : redistributeUnspentAmounts(
          withQuantities,
          priceByTicker,
          totalAvailable,
          qualifiedTickers,
          allowed,
        );
  const suggestion: AiSuggestion = {
    id,
    walletId,
    month,
    tab,
    model,
    ...output,
    items: applyFallbackAllocations(
      applyQualifiedInvestor(rebalanced, qualifiedTickers),
      qualifiedTickers,
      comparison.items,
      priceByTicker,
    ),
    createdAt,
    ...(contribution === undefined ? {} : { contribution }),
    projectedDividends: input.projectedDividends,
    historyMonths: availableHistoryMonths,
  };
  await suggestionsCollection(uid)
    .doc(id)
    .set({ ...suggestion, input });
  await usageCollection(uid).doc().set({ createdAt, suggestionId: id });
  return suggestion;
}
