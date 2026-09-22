import { listQualifiedInvestorTickers } from '../assets/asset.service';
import { computeMonthlyIncome } from '../dividend/monthly-income.service';
import {
  aiSuggestionUsageCollection,
  aiSuggestionsCollection,
} from '../firestore/paths';
import { getQuotesByTicker } from '../quotes/quote-prices';
import { today } from '../shared/date';
import { HttpError } from '../shared/http-error';
import { logError } from '../shared/logger';
import { validPrice } from '../shared/numbers';
import { SYSTEM_PROMPT, buildUserPrompt } from './ai-suggestion.prompt';
import {
  compareWithWallet,
  getRecommendedWallet,
} from './recommended-wallet.service';
import {
  AiSuggestion,
  AiSuggestionTab,
  RecommendedWallet,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
} from 'dindin-models';
import { getFirestore } from 'firebase-admin/firestore';
import {
  applyFallbackAllocations,
  applyQualifiedInvestor,
  applySuggestedQuantities,
  redistributeUnspentAmounts,
} from './ai-suggestion.allocation';
import { isTab, parseSuggestionOutput } from './ai-suggestion.parser';
import { callOpenRouter } from './openrouter.client';

/**
 * Orquestração da sugestão da IA (issue #306).
 *
 * Monta a entrada a partir da carteira recomendada e da carteira do usuário,
 * controla a cota diária, chama o cliente da OpenRouter, passa a resposta
 * pelo parser e pelas regras de alocação, e persiste o resultado. As quatro
 * responsabilidades que antes viviam aqui estão em módulos próprios.
 */

export interface AiSuggestionInputItem extends RecommendedWalletComparisonItem {
  segment?: string;
  weight?: number;
  closePrice?: number;
  monthlyDividend?: number; // último provento pago informado pela Brapi (#290)
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

export const DAILY_SUGGESTION_LIMIT = 5;

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
  monthlyDividendByTicker: Map<string, number>,
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
    const monthlyDividend = monthlyDividendByTicker.get(
      item.ticker.toUpperCase(),
    );
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

/**
 * Dias que o contador de uso sobrevive antes do TTL do Firestore apagá-lo.
 * Só o dia corrente importa para o limite; a margem existe para inspecionar
 * consumo recente. A política de TTL é configurada no campo `expiresAt` da
 * collection `aiSuggestionUsage` (ver README).
 */
const USAGE_RETENTION_DAYS = 30;

/**
 * Reserva uma geração do dia e devolve o dia reservado (issue #297).
 *
 * A reserva acontece **antes** da chamada ao provedor, numa transação. Antes,
 * o uso era contado no início e gravado só depois da resposta da OpenRouter,
 * que leva até 120 s: requisições paralelas liam todas o mesmo total e
 * passavam juntas pelo limite, sem teto real de custo.
 *
 * O contador vive num documento por dia, no fuso do produto. Com o dia do
 * servidor (UTC), o limite reiniciava às 21h em Brasília.
 */
export async function reserveDailySuggestion(
  uid: string,
  now: Date = new Date(),
): Promise<string> {
  const day = today(now);
  const reference = aiSuggestionUsageCollection(uid).doc(day);

  await getFirestore().runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const count = (document.data()?.count as number | undefined) ?? 0;

    if (count >= DAILY_SUGGESTION_LIMIT) {
      throw HttpError.tooManyRequests('Limite diário de sugestões atingido');
    }

    transaction.set(reference, {
      count: count + 1,
      updatedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ),
    });
  });

  return day;
}

/**
 * Devolve uma cota reservada que não virou sugestão — falha do provedor, por
 * exemplo. Sem isso, um 502 consumiria a cota do usuário.
 */
export async function releaseDailySuggestion(
  uid: string,
  day: string,
): Promise<void> {
  const reference = aiSuggestionUsageCollection(uid).doc(day);

  await getFirestore().runTransaction(async (transaction) => {
    const document = await transaction.get(reference);

    // Sem contador não há o que devolver. Criar o documento aqui gravaria um
    // `{ count: 0 }` sem `expiresAt`, que o TTL nunca apagaria.
    if (!document.exists) return;

    const count = (document.data()?.count as number | undefined) ?? 0;

    transaction.set(
      reference,
      { ...document.data(), count: Math.max(0, count - 1) },
      { merge: true },
    );
  });
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
  const doc = await aiSuggestionsCollection(uid).doc(id).get();
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
  if (!isTab(tab)) throw HttpError.badRequest('Aba inválida');
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
  // Lida também com `force`: as compras já lançadas na carteira (#276)
  // continuam marcadas na sugestão gerada de novo.
  const saved = await getSavedSuggestion(uid, walletId, month, tab);
  if (
    !force &&
    saved &&
    saved.contribution === contribution &&
    JSON.stringify(saved.historyMonths ?? []) ===
      JSON.stringify(availableHistoryMonths)
  ) {
    return saved;
  }
  // A cota é reservada antes de qualquer chamada ao provedor e devolvida se
  // a geração não chegar ao fim (issue #297).
  const reservedDay = await reserveDailySuggestion(uid);
  try {
    return await buildAndSaveSuggestion({
      uid,
      walletId,
      month,
      tab,
      comparison,
      availableHistoryMonths,
      history,
      contribution,
      saved,
    });
  } catch (error) {
    // A devolução é uma segunda transação no mesmo documento disputado. Se
    // ela falhar, quem precisa chegar ao cliente é o erro original — uma
    // falha aqui vira log, não um 500 genérico por cima do 502 do provedor.
    await releaseDailySuggestion(uid, reservedDay).catch((releaseError) =>
      logError('generateSuggestion.quotaReleaseFailed', {
        uid,
        day: reservedDay,
        message: (releaseError as Error).message,
      }),
    );
    throw error;
  }
}

interface BuildSuggestionArgs {
  uid: string;
  walletId: string;
  month: string;
  tab: AiSuggestionTab;
  comparison: RecommendedWalletComparison;
  availableHistoryMonths: string[];
  history: AiSuggestionHistoryMonth[];
  contribution?: number;
  saved: AiSuggestion | null;
}

/** Monta, consulta a IA e persiste a sugestão, com a cota já reservada. */
async function buildAndSaveSuggestion({
  uid,
  walletId,
  month,
  tab,
  comparison,
  availableHistoryMonths,
  history,
  contribution,
  saved,
}: BuildSuggestionArgs): Promise<AiSuggestion> {
  // Só os tickers em jogo: os da comparação (posições do usuário) e os da
  // carteira recomendada do mês (issue #299). A mesma leitura serve para
  // preço e provento — `computeMonthlyIncome` só conhece o que o usuário já
  // tem, e os recomendados que faltam na carteira são justamente os que a IA
  // precisa avaliar.
  const tickersInPlay = [
    ...comparison.items.map((item) => item.ticker),
    ...comparison.recommended[tab].map((asset) => asset.ticker),
  ];
  const [income, quotes, qualifiedTickers] = await Promise.all([
    computeMonthlyIncome(uid, walletId),
    getQuotesByTicker(tickersInPlay),
    listQualifiedInvestorTickers(),
  ]);

  const quotePrices = new Map<string, number>();
  const monthlyDividendByTicker = new Map(income.monthlyDividendByTicker);
  for (const [ticker, quote] of quotes) {
    const price = validPrice(quote.price);
    if (price !== undefined) quotePrices.set(ticker, price);

    const monthlyDividend = validPrice(quote.monthlyDividend);
    if (monthlyDividend !== undefined && !monthlyDividendByTicker.has(ticker)) {
      monthlyDividendByTicker.set(ticker, monthlyDividend);
    }
  }
  const input = buildSuggestionInput(
    comparison,
    tab,
    monthlyDividendByTicker,
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
    ...(saved?.appliedItems?.length
      ? { appliedItems: saved.appliedItems }
      : {}),
  };
  await aiSuggestionsCollection(uid)
    .doc(id)
    .set({ ...suggestion, input });
  return suggestion;
}
