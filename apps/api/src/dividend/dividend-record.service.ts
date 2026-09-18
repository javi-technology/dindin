import { getFirestore } from 'firebase-admin/firestore';
import { Dividend, FridgeItem, Position, Quote } from 'dindin-models';
import {
  fetchFridgeItems,
  getAllUserPositions,
  todayDateInBrazil,
} from '../patrimony/patrimony-snapshot.service';

const BATCH_SIZE = 10;

function userCollection(userId: string, collection: string) {
  return getFirestore().collection('users').doc(userId).collection(collection);
}

function normalizeTicker(ticker: unknown): string {
  return typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
}

function validQuantity(quantity: unknown): number {
  return typeof quantity === 'number' &&
    Number.isFinite(quantity) &&
    quantity > 0
    ? quantity
    : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function autoDividendId(month: string, ticker: string): string {
  return `${month}_${normalizeTicker(ticker)}`;
}

export async function recordMonthlyDividends(
  userId: string,
  date = todayDateInBrazil(),
): Promise<Dividend[]> {
  const [quotesSnapshot, positions, fridgeItems] = await Promise.all([
    getFirestore().collection('quotes').get(),
    getAllUserPositions(userId),
    fetchFridgeItems(userId),
  ]);

  const month = monthKey(date);

  // `quotes` guarda só o último provento anunciado. Registrar esse valor todo
  // mês inventaria pagamentos para quem paga trimestral, semestral ou
  // anualmente: entra só o evento cujo pagamento cai na competência (#112).
  const dividendByTicker = new Map<
    string,
    { amountPerShare: number; paymentDate: string }
  >();
  for (const quoteDoc of quotesSnapshot.docs) {
    const quote = quoteDoc.data() as Quote;
    const ticker = normalizeTicker(quote.ticker || quoteDoc.id);
    if (
      ticker &&
      typeof quote.monthlyDividend === 'number' &&
      Number.isFinite(quote.monthlyDividend) &&
      quote.monthlyDividend > 0 &&
      typeof quote.dividendPaymentDate === 'string' &&
      monthKey(quote.dividendPaymentDate) === month
    ) {
      dividendByTicker.set(ticker, {
        amountPerShare: quote.monthlyDividend,
        paymentDate: quote.dividendPaymentDate,
      });
    }
  }

  const quantityByTicker = new Map<string, number>();
  for (const item of [...positions, ...fridgeItems] as Array<
    Position | FridgeItem
  >) {
    const ticker = normalizeTicker(item.ticker);
    const quantity = validQuantity(item.quantity);
    if (!ticker || quantity === 0) {
      continue;
    }
    quantityByTicker.set(
      ticker,
      (quantityByTicker.get(ticker) ?? 0) + quantity,
    );
  }

  const now = new Date().toISOString();
  const dividendsCollection = userCollection(userId, 'dividends');
  const existingSnapshot = await dividendsCollection
    .where('paymentDate', '>=', `${month}-01`)
    .where('paymentDate', '<=', `${month}-31`)
    .get();
  const existingAuto = existingSnapshot.docs.filter(
    (doc: FirebaseFirestore.DocumentSnapshot) => doc.data()?.source === 'auto',
  );
  const manualTickers = new Set(
    existingSnapshot.docs
      .filter(
        (doc: FirebaseFirestore.DocumentSnapshot) =>
          doc.data()?.source !== 'auto',
      )
      .map((doc: FirebaseFirestore.DocumentSnapshot) =>
        normalizeTicker(doc.data()?.ticker),
      )
      .filter(Boolean),
  );
  const batch = getFirestore().batch();
  const dividends: Dividend[] = [];
  const desiredIds = new Set<string>();

  for (const ticker of [...quantityByTicker.keys()].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const event = dividendByTicker.get(ticker);
    const quantity = quantityByTicker.get(ticker)!;
    if (event === undefined || quantity === 0 || manualTickers.has(ticker)) {
      continue;
    }
    const { amountPerShare, paymentDate } = event;

    const dividend: Dividend = {
      id: autoDividendId(month, ticker),
      userId,
      ticker,
      amountPerShare,
      quantity,
      totalAmount: roundCurrency(amountPerShare * quantity),
      paymentDate,
      source: 'auto',
      createdAt: now,
      updatedAt: now,
    };
    const { id: _id, ...data } = dividend;
    batch.set(dividendsCollection.doc(dividend.id), data);
    desiredIds.add(dividend.id);
    dividends.push(dividend);
  }

  // Quando a Brapi já anunciou o provento seguinte, o evento pago no mês some
  // de `quotes`; o registro feito antes continua valendo enquanto o ativo
  // estiver na carteira e não houver lançamento manual para ele.
  for (const existingDoc of existingAuto) {
    const ticker = normalizeTicker(existingDoc.data()?.ticker);
    const stillValid =
      quantityByTicker.has(ticker) && !manualTickers.has(ticker);
    if (!desiredIds.has(existingDoc.id) && !stillValid) {
      batch.delete(dividendsCollection.doc(existingDoc.id));
    }
  }

  await batch.commit();
  return dividends;
}

export async function recordAllMonthlyDividends(): Promise<void> {
  const userDocuments = await getFirestore()
    .collection('users')
    .listDocuments();
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < userDocuments.length; i += BATCH_SIZE) {
    const batch = userDocuments.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((userDocument) => recordMonthlyDividends(userDocument.id)),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded += 1;
      } else {
        failed += 1;
        console.error(
          `[recordAllMonthlyDividends] Erro ao registrar ${batch[index].id}:`,
          { message: (result.reason as Error).message },
        );
      }
    });
  }

  console.log(
    `[recordAllMonthlyDividends] Concluído. ${succeeded} usuário(s) atualizado(s), ${failed} falha(s).`,
  );

  if (failed > 0) {
    throw new Error(
      `[recordAllMonthlyDividends] ${failed} de ${userDocuments.length} registro(s) falharam`,
    );
  }
}
