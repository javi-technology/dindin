import * as admin from 'firebase-admin';
import { FridgeItem, PatrimonySnapshot, Position, Quote } from 'dindin-models';

const BATCH_SIZE = 10;

function userCollection(userId: string, collection: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection(collection);
}

export function todayDateInBrazil(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function validQuantity(quantity: unknown): number {
  return typeof quantity === 'number' &&
    Number.isFinite(quantity) &&
    quantity >= 0
    ? quantity
    : 0;
}

function validPrice(price: unknown): number | undefined {
  return typeof price === 'number' && Number.isFinite(price)
    ? price
    : undefined;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

async function getAllUserPositions(userId: string): Promise<Position[]> {
  const walletsSnapshot = await userCollection(userId, 'wallets').get();
  const positionsByWallet = await Promise.all(
    walletsSnapshot.docs.map((walletDoc) =>
      walletDoc.ref.collection('positions').get(),
    ),
  );

  return positionsByWallet.flatMap((positionsSnapshot) =>
    positionsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    ),
  );
}

async function fetchFridgeItems(userId: string): Promise<FridgeItem[]> {
  const items: FridgeItem[] = [];
  const fridgesSnapshot = await userCollection(userId, 'fridges').get();

  for (const fridgeDoc of fridgesSnapshot.docs) {
    const itemsSnapshot = await fridgeDoc.ref.collection('fridgeItems').get();
    for (const itemDoc of itemsSnapshot.docs) {
      items.push({ id: itemDoc.id, ...itemDoc.data() } as FridgeItem);
    }
  }

  return items;
}

export async function computeUserPatrimony(
  userId: string,
): Promise<{ totalWallet: number; totalFridge: number; total: number }> {
  const [quotesSnapshot, positions, fridgeItems] = await Promise.all([
    admin.firestore().collection('quotes').get(),
    getAllUserPositions(userId),
    fetchFridgeItems(userId),
  ]);

  const quoteByTicker = new Map<string, number>();
  for (const quoteDoc of quotesSnapshot.docs) {
    const quote = quoteDoc.data() as Quote;
    const price = validPrice(quote.price);
    if (price !== undefined) {
      quoteByTicker.set(quoteDoc.id.toUpperCase(), price);
    }
  }

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
  date = todayDateInBrazil(),
): Promise<PatrimonySnapshot> {
  const totals = await computeUserPatrimony(userId);
  const snapshot: PatrimonySnapshot = {
    id: date,
    userId,
    date,
    ...totals,
    createdAt: new Date().toISOString(),
  };

  await userCollection(userId, 'patrimonySnapshots').doc(date).set(snapshot);
  return snapshot;
}

export async function listPatrimonySnapshots(
  userId: string,
  limit = 365,
): Promise<PatrimonySnapshot[]> {
  const snapshot = await userCollection(userId, 'patrimonySnapshots')
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as PatrimonySnapshot)
    .reverse();
}

export async function saveAllPatrimonySnapshots(): Promise<void> {
  const userDocuments = await admin
    .firestore()
    .collection('users')
    .listDocuments();
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
