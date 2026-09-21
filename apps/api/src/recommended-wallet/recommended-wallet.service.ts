import { getFirestore } from 'firebase-admin/firestore';
import {
  positionsCollection,
  recommendedWalletsCollection,
} from '../firestore/paths';
import { getQuotePricesByTicker } from '../quotes/quote-prices';
import { currentMonth } from '../shared/date';
import { HttpError } from '../shared/http-error';
import {
  RecommendedWallet,
  RecommendedWalletAsset,
  RecommendedWalletComparison,
  RecommendedWalletComparisonItem,
} from 'dindin-models';
import { assetExists } from '../assets/asset.service';
import { parseBbFileName, parseBbFiiPdf, ParsedRow } from './bb-pdf.parser';
import { fetchLatestBbPdf } from './bb-pdf.fetch.service';
import { BB_WALLET_PREFIX, saveBbPdf } from './storage.service';
import { logInfo } from '../shared/logger';

export function recommendedWalletId(month: string): string {
  return `bb-fii_${month}`.toLowerCase();
}

function sourceFileName(sourceFile: string): string {
  return sourceFile.split('/').pop() ?? sourceFile;
}

async function mapAssets(rows: ParsedRow[]): Promise<RecommendedWalletAsset[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      inCatalog: await assetExists(row.ticker),
    })),
  );
}

export async function buildRecommendedWallet(
  buffer: Buffer,
  sourceFile: string,
): Promise<RecommendedWallet> {
  const parsedFile = parseBbFileName(sourceFileName(sourceFile));
  if (!parsedFile) {
    throw new Error(
      `Nome de arquivo BB inválido: ${sourceFileName(sourceFile)}`,
    );
  }

  const id = recommendedWalletId(parsedFile.month);
  const docRef = recommendedWalletsCollection().doc(id);
  const existingDoc = await docRef.get();
  const existing = existingDoc.exists
    ? (existingDoc.data() as RecommendedWallet)
    : undefined;
  if (existing && existing.revision >= parsedFile.revision) {
    logInfo('buildRecommendedWallet.skipped', {
      sourceFile,
      revision: parsedFile.revision,
    });
    return { ...existing, id: existing.id ?? id };
  }

  const parsed = await parseBbFiiPdf(buffer);
  const [renda, ganho] = await Promise.all([
    mapAssets(parsed.renda),
    mapAssets(parsed.ganho),
  ]);
  const now = new Date().toISOString();
  const wallet: RecommendedWallet = {
    id,
    provider: 'BB',
    month: parsedFile.month,
    revision: parsedFile.revision,
    publishedAt: parsed.publishedAt,
    sourceFile,
    status: 'pending_review',
    renda,
    ganho,
    parsedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return wallet;
}

export async function persistRecommendedWallet(
  wallet: RecommendedWallet,
): Promise<RecommendedWallet> {
  const docRef = recommendedWalletsCollection().doc(wallet.id);
  return getFirestore().runTransaction(async (transaction) => {
    const existingDoc = await transaction.get(docRef);
    const existing = existingDoc.exists
      ? (existingDoc.data() as RecommendedWallet)
      : undefined;
    if (existing && existing.revision >= wallet.revision) {
      return { ...existing, id: existing.id ?? wallet.id };
    }

    const persisted = {
      ...wallet,
      createdAt: existing?.createdAt ?? wallet.createdAt,
    };
    transaction.set(docRef, persisted);
    logInfo('persistRecommendedWallet.imported', {
      walletId: wallet.id,
      revision: wallet.revision,
    });
    return persisted;
  });
}

export async function importBbWallet(
  buffer: Buffer,
  sourceFile: string,
): Promise<RecommendedWallet> {
  logInfo('importBbWallet.start', { sourceFile });
  const wallet = await buildRecommendedWallet(buffer, sourceFile);
  return persistRecommendedWallet(wallet);
}

export async function getRecommendedWallet(
  month?: string,
): Promise<RecommendedWallet | null> {
  const collection = recommendedWalletsCollection();
  const doc = month
    ? await collection.doc(recommendedWalletId(month)).get()
    : (await collection.orderBy('month', 'desc').limit(1).get()).docs[0];
  if (!doc || !doc.exists) return null;
  return { id: doc.id, ...doc.data() } as RecommendedWallet;
}

export async function listRecommendedWallets(): Promise<RecommendedWallet[]> {
  const snapshot = await recommendedWalletsCollection()
    .orderBy('month', 'desc')
    .get();
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as RecommendedWallet,
  );
}

export async function confirmRecommendedWallet(
  id: string,
): Promise<RecommendedWallet> {
  const docRef = recommendedWalletsCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw HttpError.notFound('Carteira recomendada não encontrada');
  }
  const confirmedAt = new Date().toISOString();
  await docRef.update({
    status: 'confirmed',
    confirmedAt,
    updatedAt: confirmedAt,
  });
  return {
    id: doc.id,
    ...doc.data(),
    status: 'confirmed',
    confirmedAt,
    updatedAt: confirmedAt,
  } as RecommendedWallet;
}

/**
 * Preços dos tickers informados. Recebia a coleção inteira; nas rotas o custo
 * precisa acompanhar a carteira do usuário, não o catálogo (issue #299).
 */
export async function getQuotePrices(
  tickers: string[],
): Promise<Map<string, number>> {
  return getQuotePricesByTicker(tickers);
}

export async function compareWithWallet(
  userId: string,
  walletId: string,
  month?: string,
  wallet: 'renda' | 'ganho' = 'renda',
): Promise<RecommendedWalletComparison> {
  const recommended = await getRecommendedWallet(month);
  if (!recommended) {
    throw HttpError.notFound('Carteira recomendada não encontrada');
  }

  const positionsSnapshot = await positionsCollection(userId, walletId).get();
  const positionTickers = positionsSnapshot.docs.map(
    (doc) => (doc.data() as { ticker?: string }).ticker ?? '',
  );
  // Os recomendados entram na busca porque a comparação mostra também o que
  // o usuário ainda não tem na carteira.
  const quotesByTicker = await getQuotePricesByTicker([
    ...positionTickers,
    ...recommended[wallet].map((asset) => asset.ticker),
  ]);
  const positionsByTicker = new Map<
    string,
    { quantity: number; currentValue: number }
  >();
  for (const doc of positionsSnapshot.docs) {
    const position = doc.data() as {
      ticker?: string;
      quantity?: number;
      averagePrice?: number;
    };
    if (!position.ticker) continue;
    const ticker = position.ticker.toUpperCase();
    const quantity = Number(position.quantity) || 0;
    const unitPrice =
      quotesByTicker.get(ticker) ?? (Number(position.averagePrice) || 0);
    const previous = positionsByTicker.get(ticker) ?? {
      quantity: 0,
      currentValue: 0,
    };
    positionsByTicker.set(ticker, {
      quantity: previous.quantity + quantity,
      currentValue: previous.currentValue + quantity * unitPrice,
    });
  }

  const recommendedAssets = recommended[wallet];
  const recommendedByTicker = new Map(
    recommendedAssets.map((asset) => [asset.ticker.toUpperCase(), asset]),
  );
  const tickers = new Set([
    ...recommendedByTicker.keys(),
    ...positionsByTicker.keys(),
  ]);
  const totalValue = [...positionsByTicker.values()].reduce(
    (sum, position) => sum + position.currentValue,
    0,
  );
  const items: RecommendedWalletComparisonItem[] = [...tickers]
    .sort()
    .map((ticker) => {
      const position = positionsByTicker.get(ticker);
      const recommendation = recommendedByTicker.get(ticker);
      const currentValue = position?.currentValue ?? 0;
      return {
        ticker,
        recommendedWeight: recommendation?.weight ?? null,
        currentWeight:
          position && totalValue > 0 ? currentValue / totalValue : null,
        quantity: position?.quantity ?? 0,
        currentValue,
        status: recommendation ? (position ? 'match' : 'missing') : 'extra',
      };
    });
  return { recommended, items, totalValue };
}

export async function syncBbWallet(): Promise<void> {
  const found = await fetchLatestBbPdf(currentMonth());
  if (!found) {
    logInfo('syncBbWallet.noPdf');
    return;
  }
  const sourceFile = `${BB_WALLET_PREFIX}${found.fileName}`;
  const wallet = await buildRecommendedWallet(found.buffer, sourceFile);
  await saveBbPdf(found.fileName, found.buffer);
  await persistRecommendedWallet(wallet);
}
