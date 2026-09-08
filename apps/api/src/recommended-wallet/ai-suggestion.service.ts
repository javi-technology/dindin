import * as admin from 'firebase-admin';
import {
  AiSuggestion,
  AiSuggestionItem,
  AiSuggestionTab,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
} from 'dindin-models';
import { compareWithWallet } from './recommended-wallet.service';
import { buildUserPrompt, SYSTEM_PROMPT } from './ai-suggestion.prompt';

export interface AiSuggestionInputItem extends RecommendedWalletComparisonItem {
  segment?: string;
  weight?: number;
  closePrice?: number;
  monthlyDividend?: number;
}

export interface AiSuggestionInput {
  month: string;
  tab: AiSuggestionTab;
  totalValue: number;
  contribution?: number;
  projectedDividends: number;
  items: AiSuggestionInputItem[];
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

export function buildSuggestionInput(
  comparison: RecommendedWalletComparison,
  tab: AiSuggestionTab,
  quotesByTicker: Map<string, number>,
  contribution?: number,
): AiSuggestionInput {
  const assets = new Map(
    comparison.recommended[tab].map((asset) => [
      asset.ticker.toUpperCase(),
      asset,
    ]),
  );
  const items = comparison.items.map((item) => {
    const asset = assets.get(item.ticker.toUpperCase());
    return {
      ...item,
      segment: asset?.segment,
      weight: asset?.weight,
      closePrice: asset?.closePrice,
      monthlyDividend: quotesByTicker.get(item.ticker.toUpperCase()),
    };
  });
  const projectedDividends = items.reduce(
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
  };
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
    const parsed: unknown = JSON.parse(fenced?.[1] ?? trimmed);
    if (!parsed || typeof parsed !== 'object') throw new Error();
    const data = parsed as Record<string, unknown>;
    if (typeof data.summary !== 'string' || !Array.isArray(data.items)) {
      throw new Error();
    }
    if (!data.items.every(isValidItem)) throw new Error();
    const normalizedAllowed = new Map(
      [...allowed.entries()].map(([ticker, status]) => [
        ticker.toUpperCase(),
        status,
      ]),
    );
    const items = (data.items as AiSuggestionItem[])
      .filter((item) => normalizedAllowed.has(item.ticker.toUpperCase()))
      .sort((a, b) => a.priority - b.priority);
    if (items.length === 0) throw new Error();
    if (
      items.some(
        (item) =>
          normalizedAllowed.get(item.ticker.toUpperCase()) === 'extra' &&
          item.action === 'buy',
      )
    ) {
      throw new Error();
    }
    if (totalAvailable !== undefined) {
      const buyTotal = items
        .filter((item) => item.action === 'buy')
        .reduce((total, item) => total + (item.suggestedAmount ?? 0), 0);
      if (buyTotal > totalAvailable * 1.01) throw new Error();
    }
    return {
      summary: data.summary,
      items,
      disclaimer:
        typeof data.disclaimer === 'string'
          ? data.disclaimer
          : DEFAULT_DISCLAIMER,
    };
  } catch {
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
  if (!force) {
    const saved = await getSavedSuggestion(uid, walletId, month, tab);
    if (saved && saved.contribution === contribution) return saved;
  }
  await checkDailyLimit(uid);
  const comparison = await compareWithWallet(uid, walletId, month, tab);
  const quotesSnapshot = await admin.firestore().collection('quotes').get();
  const monthlyDividends = new Map<string, number>(
    quotesSnapshot.docs.flatMap((doc: { id: string; data: () => unknown }) => {
      const value = (doc.data() as { monthlyDividend?: unknown })
        .monthlyDividend;
      return typeof value === 'number' && Number.isFinite(value)
        ? [[doc.id.toUpperCase(), value]]
        : [];
    }),
  );
  const input = buildSuggestionInput(
    comparison,
    tab,
    monthlyDividends,
    contribution,
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
  const id = suggestionId(walletId, month, tab);
  const createdAt = new Date().toISOString();
  const suggestion: AiSuggestion = {
    id,
    walletId,
    month,
    tab,
    model,
    ...output,
    createdAt,
    ...(contribution === undefined ? {} : { contribution }),
    projectedDividends: input.projectedDividends,
  };
  await suggestionsCollection(uid)
    .doc(id)
    .set({ ...suggestion, input });
  await usageCollection(uid).doc().set({ createdAt, suggestionId: id });
  return suggestion;
}
