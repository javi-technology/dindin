import { PatrimonySnapshot } from 'dindin-models';
import {
  patrimonySnapshotsCollection,
  usersCollection,
} from '../firestore/paths';
import { loadAllQuotePrices } from '../quotes/quote-prices';
import { roundCurrency, validPrice, validQuantity } from '../shared/numbers';
import { today } from '../shared/date';
import { getAllUserFridgeItems } from '../wallet/fridge-reader';
import { getAllUserPositions } from '../wallet/position-reader';

const BATCH_SIZE = 10;

export async function computeUserPatrimony(
  userId: string,
): Promise<{ totalWallet: number; totalFridge: number; total: number }> {
  const [quoteByTicker, positions, fridgeItems] = await Promise.all([
    loadAllQuotePrices(),
    getAllUserPositions(userId),
    getAllUserFridgeItems(userId),
  ]);

  const valueOf = (
    item: { ticker: unknown; quantity: unknown },
    fallbackPrice: unknown,
  ): number => {
    const quantity = validQuantity(item.quantity);
    if (quantity === 0 || typeof item.ticker !== 'string') {
      return 0;
    }

    const quotePrice = quoteByTicker.get(item.ticker.toUpperCase());
    const unitPrice = quotePrice ?? validPrice(fallbackPrice) ?? 0;
    return quantity * unitPrice;
  };

  const totalWallet = roundCurrency(
    positions.reduce(
      (sum, position) => sum + valueOf(position, position.averagePrice),
      0,
    ),
  );
  const totalFridge = roundCurrency(
    fridgeItems.reduce(
      (sum, item) => sum + valueOf(item, item.transferredPrice),
      0,
    ),
  );

  return {
    totalWallet,
    totalFridge,
    total: roundCurrency(totalWallet + totalFridge),
  };
}

export async function savePatrimonySnapshot(
  userId: string,
  date = today(),
): Promise<PatrimonySnapshot> {
  const totals = await computeUserPatrimony(userId);
  const snapshot: PatrimonySnapshot = {
    id: date,
    userId,
    date,
    ...totals,
    createdAt: new Date().toISOString(),
  };

  await patrimonySnapshotsCollection(userId).doc(date).set(snapshot);
  return snapshot;
}

export async function listPatrimonySnapshots(
  userId: string,
  limit = 365,
): Promise<PatrimonySnapshot[]> {
  const snapshot = await patrimonySnapshotsCollection(userId)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as PatrimonySnapshot)
    .reverse();
}

export async function saveAllPatrimonySnapshots(): Promise<void> {
  const userDocuments = await usersCollection().listDocuments();
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < userDocuments.length; i += BATCH_SIZE) {
    const batch = userDocuments.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((userDocument) => savePatrimonySnapshot(userDocument.id)),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded += 1;
      } else {
        failed += 1;
        console.error(
          `[saveAllPatrimonySnapshots] Erro ao salvar ${batch[index].id}:`,
          { message: (result.reason as Error).message },
        );
      }
    });
  }

  console.log(
    `[saveAllPatrimonySnapshots] Concluído. ${succeeded} usuário(s) atualizado(s), ${failed} falha(s).`,
  );

  if (failed > 0) {
    throw new Error(
      `[saveAllPatrimonySnapshots] ${failed} de ${userDocuments.length} snapshot(s) falharam`,
    );
  }
}
