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
      if (
        normalizedAllowed.get(item.ticker.toUpperCase()) === 'extra' &&
        item.action === 'buy'
      ) {
        const { suggestedAmount: _suggestedAmount, ...itemWithoutAmount } =
          item;
        console.warn(
          '[parseSuggestionOutput] compra em item extra convertida',
          {
            ticker: item.ticker,
          },
        );
        return { ...itemWithoutAmount, action: 'hold' as const };
      }
      return item;
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
  const suggestion: AiSuggestion = {
    id,
    walletId,
    month,
    tab,
    model,
    ...output,
    items: applyQualifiedInvestor(
      applySuggestedQuantities(output.items, priceByTicker),
      qualifiedTickers,
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
