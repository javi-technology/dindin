import * as admin from 'firebase-admin';
import {
  RecommendedWallet,
  RecommendedWalletAsset,
  Quote,
} from 'dindin-models';
import { assetExists } from '../assets/asset.service';
import { parseBbFileName, parseBbFiiPdf, ParsedRow } from './bb-pdf.parser';
import { fetchLatestBbPdf } from './bb-pdf.fetch.service';
import { saveBbPdf } from './storage.service';

function recommendedWalletsCollection() {
  return admin.firestore().collection('recommendedWallets');
}

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

export async function importBbWallet(
  buffer: Buffer,
  sourceFile: string,
): Promise<RecommendedWallet> {
  console.log(`[importBbWallet] Iniciando importação: ${sourceFile}`);
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
    console.log(
      `[importBbWallet] Ignorada ${sourceFile}: revisão ${parsedFile.revision} já processada`,
    );
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
  await docRef.set(wallet);
  console.log(`[importBbWallet] Importada ${id} revisão ${wallet.revision}`);
  return wallet;
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
    const error = new Error('Carteira recomendada não encontrada') as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    throw error;
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

function positionsCollection(userId: string, walletId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc(walletId)
    .collection('positions');
}

function quotePriceByTicker(snapshot: {
  docs: Array<{ id: string; data: () => unknown }>;
}): Map<string, number> {
  return new Map(
    snapshot.docs.flatMap((doc) => {
      const quote = doc.data() as Partial<Quote>;
      return typeof quote.price === 'number' && Number.isFinite(quote.price)
        ? [[doc.id.toUpperCase(), quote.price] as [string, number]]
        : [];
    }),
  );
}

export async function compareWithWallet(
  userId: string,
  walletId: string,
  month?: string,
  wallet: 'renda' | 'ganho' = 'renda',
) {
  const recommended = await getRecommendedWallet(month);
  if (!recommended) {
    const error = new Error('Carteira recomendada não encontrada') as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    throw error;
  }

  const [positionsSnapshot, quotesSnapshot] = await Promise.all([
    positionsCollection(userId, walletId).get(),
    admin.firestore().collection('quotes').get(),
  ]);
  const quotesByTicker = quotePriceByTicker(quotesSnapshot);
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
  const items = [...tickers].sort().map((ticker) => {
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
    } as const;
  });
  return { recommended, items, totalValue };
}

export async function syncBbWallet(): Promise<void> {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const found = await fetchLatestBbPdf(currentMonth);
  if (!found) {
    console.log('[syncBbWallet] Nenhum PDF disponível');
    return;
  }
  const id = recommendedWalletId(currentMonth);
  const existing = await recommendedWalletsCollection().doc(id).get();
  if (
    existing.exists &&
    (existing.data() as RecommendedWallet).revision >= found.revision
  ) {
    console.log(`[syncBbWallet] Revisão ${found.revision} já processada`);
    return;
  }
  const sourceFile = await saveBbPdf(found.fileName, found.buffer);
  await importBbWallet(found.buffer, sourceFile);
}

export const syncBbRendaWallet = syncBbWallet;
