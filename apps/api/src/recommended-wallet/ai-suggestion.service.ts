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
  items: AiSuggestionInputItem[];
}

const DEFAULT_DISCLAIMER =
  'Conteúdo gerado por IA. Não é recomendação de investimento.';
export const OPENROUTER_TIMEOUT_MS = 30_000;
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

function isTab(value: unknown): value is AiSuggestionTab {
  return value === 'renda' || value === 'ganho';
}

export function buildSuggestionInput(
  comparison: RecommendedWalletComparison,
  tab: AiSuggestionTab,
  quotesByTicker: Map<string, number>,
): AiSuggestionInput {
  const assets = new Map(
    comparison.recommended[tab].map((asset) => [
      asset.ticker.toUpperCase(),
      asset,
    ]),
  );
  return {
    month: comparison.recommended.month,
    tab,
    totalValue: comparison.totalValue,
    items: comparison.items.map((item) => {
      const asset = assets.get(item.ticker.toUpperCase());
      return {
        ...item,
        segment: asset?.segment,
        weight: asset?.weight,
        closePrice: asset?.closePrice,
        monthlyDividend: quotesByTicker.get(item.ticker.toUpperCase()),
      };
    }),
  };
}

function isValidItem(value: unknown): value is AiSuggestionItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.ticker === 'string' &&
    item.ticker.length > 0 &&
    (item.action === 'buy' ||
      item.action === 'hold' ||
      item.action === 'reduce') &&
    Number.isInteger(item.priority) &&
    (item.priority as number) >= 1 &&
    typeof item.rationale === 'string' &&
    (item.suggestedAmount === undefined ||
      (typeof item.suggestedAmount === 'number' &&
        Number.isFinite(item.suggestedAmount) &&
        item.suggestedAmount >= 0))
  );
}

export function parseSuggestionOutput(
  raw: string,
  allowedTickers: Set<string>,
): { summary: string; items: AiSuggestionItem[]; disclaimer: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error();
    const data = parsed as Record<string, unknown>;
    if (typeof data.summary !== 'string' || !Array.isArray(data.items)) {
      throw new Error();
    }
    if (!data.items.every(isValidItem)) throw new Error();
    const normalizedAllowedTickers = new Set(
      [...allowedTickers].map((ticker) => ticker.toUpperCase()),
    );
    const items = (data.items as AiSuggestionItem[])
      .filter((item) => normalizedAllowedTickers.has(item.ticker.toUpperCase()))
      .sort((a, b) => a.priority - b.priority);
    if (items.length === 0) throw new Error();
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
  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error();
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as { model?: unknown }).model !== 'string' ||
      !Array.isArray((data as { choices?: unknown }).choices) ||
      typeof (data as { choices: Array<{ message?: { content?: unknown } }> })
        .choices[0]?.message?.content !== 'string'
    ) {
      throw new Error();
    }
    const result = data as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    return { content: result.choices[0].message.content, model: result.model };
  } catch {
    throw createError('Falha ao consultar o provedor de IA', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkDailyLimit(uid: string): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const snapshot = await suggestionsCollection(uid)
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
  return doc.exists ? ({ id: doc.id, ...doc.data() } as AiSuggestion) : null;
}

export async function generateSuggestion(
  uid: string,
  walletId: string,
  month: string,
  tab: AiSuggestionTab,
  force: boolean,
): Promise<AiSuggestion> {
  if (!isTab(tab)) throw createError('Aba inválida', 400);
  if (!force) {
    const saved = await getSavedSuggestion(uid, walletId, month, tab);
    if (saved) return saved;
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
  const input = buildSuggestionInput(comparison, tab, monthlyDividends);
  const allowedTickers = new Set(
    comparison.items.map((item) => item.ticker.toUpperCase()),
  );
  const { content, model } = await callOpenRouter(
    SYSTEM_PROMPT,
    buildUserPrompt(input),
  );
  const output = parseSuggestionOutput(content, allowedTickers);
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
  };
  await suggestionsCollection(uid)
    .doc(id)
    .set({ ...suggestion, input });
  return suggestion;
}
