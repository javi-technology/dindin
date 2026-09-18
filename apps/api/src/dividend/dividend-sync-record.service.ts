import { getFirestore } from 'firebase-admin/firestore';
import { Dividend } from 'dindin-models';
import { PaidDividendEvent } from '../quotes/dividend-fetch.service';

/**
 * Registro automático de proventos a partir do sync de cotações (#112).
 *
 * `quotes` guarda só o último provento anunciado, então um job em data fixa
 * perdia pagamentos: cedo demais o evento do mês ainda não existe; tarde
 * demais já foi trocado pelo anúncio seguinte. O sync recebe da Brapi a lista
 * de eventos pagos e registra cada um no dia do pagamento.
 *
 * `dividendSync/{ticker}.recordedThrough` marca até que data os pagamentos já
 * foram registrados. Ele só avança depois da gravação: um dia sem sync, ou uma
 * falha, é recuperado na execução seguinte. E só quem tem pagamento novo custa
 * as consultas de quem possui o ativo.
 */

const SYNC_COLLECTION = 'dividendSync';
// Limite de operações de um batch do Firestore.
const BATCH_LIMIT = 500;
// Id do registro mensal do job que existia antes deste sync (`YYYY-MM_TICKER`).
const LEGACY_AUTO_ID = /^\d{4}-\d{2}_/;

interface DividendSyncState {
  recordedThrough: string; // YYYY-MM-DD
  updatedAt: string;
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

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function previousDay(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

// `users/{uid}/...`
function userIdFromPath(path: string): string {
  return path.split('/')[1];
}

async function quantityByUser(ticker: string): Promise<Map<string, number>> {
  const firestore = getFirestore();
  const [positions, fridgeItems] = await Promise.all([
    firestore.collectionGroup('positions').where('ticker', '==', ticker).get(),
    firestore
      .collectionGroup('fridgeItems')
      .where('ticker', '==', ticker)
      .get(),
  ]);

  const quantities = new Map<string, number>();
  for (const doc of [...positions.docs, ...fridgeItems.docs]) {
    const quantity = validQuantity(doc.data().quantity);
    if (quantity === 0) continue;
    const userId = userIdFromPath(doc.ref.path);
    quantities.set(userId, (quantities.get(userId) ?? 0) + quantity);
  }
  return quantities;
}

/**
 * Meses em que cada usuário já tem o provento do ticker lançado à mão, ou
 * registrado pelo job mensal antigo. O lançamento manual prevalece sobre o
 * automático, e o registro antigo evitaria contar o mesmo mês duas vezes.
 */
async function blockedMonthsByUser(
  ticker: string,
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const snapshot = await getFirestore()
    .collectionGroup('dividends')
    .where('ticker', '==', ticker)
    .where('paymentDate', '>=', `${monthOf(from)}-01`)
    .where('paymentDate', '<=', `${monthOf(to)}-31`)
    .get();

  const blocked = new Map<string, Set<string>>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as Partial<Dividend>;
    if (data.source === 'auto' && !LEGACY_AUTO_ID.test(doc.id)) continue;
    if (typeof data.paymentDate !== 'string') continue;
    const userId = userIdFromPath(doc.ref.path);
    const months = blocked.get(userId) ?? new Set<string>();
    months.add(monthOf(data.paymentDate));
    blocked.set(userId, months);
  }
  return blocked;
}

/** Dividendo e JCP pagos no mesmo dia viram um único registro. */
function amountByPaymentDate(events: PaidDividendEvent[]): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const { paymentDate, rate } of events) {
    amounts.set(paymentDate, (amounts.get(paymentDate) ?? 0) + rate);
  }
  return amounts;
}

export async function recordPaidDividends(
  ticker: string,
  events: PaidDividendEvent[],
  today: string,
): Promise<Dividend[]> {
  const firestore = getFirestore();
  const syncRef = firestore.collection(SYNC_COLLECTION).doc(ticker);
  const syncSnapshot = await syncRef.get();
  const state = syncSnapshot.data() as DividendSyncState | undefined;

  // Na primeira execução não há como saber o que o job antigo já registrou:
  // considera só os pagamentos de hoje em vez de refazer um ano inteiro.
  const recordedThrough = state?.recordedThrough ?? previousDay(today);
  const pending = events.filter(
    ({ paymentDate }) => paymentDate > recordedThrough && paymentDate <= today,
  );

  const dividends: Dividend[] = [];
  if (pending.length > 0) {
    const amounts = amountByPaymentDate(pending);
    const dates = [...amounts.keys()].sort();
    const [quantities, blocked] = await Promise.all([
      quantityByUser(ticker),
      blockedMonthsByUser(ticker, dates[0], dates[dates.length - 1]),
    ]);

    const now = new Date().toISOString();
    for (const [userId, quantity] of [...quantities.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      for (const paymentDate of dates) {
        if (blocked.get(userId)?.has(monthOf(paymentDate))) continue;
        // Evita resíduos de ponto flutuante ao somar eventos do mesmo dia.
        const amountPerShare =
          Math.round(amounts.get(paymentDate)! * 1e6) / 1e6;
        dividends.push({
          id: `${paymentDate}_${ticker}`,
          userId,
          ticker,
          amountPerShare,
          quantity,
          totalAmount: roundCurrency(amountPerShare * quantity),
          paymentDate,
          source: 'auto',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (let i = 0; i < dividends.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const { id, ...data } of dividends.slice(i, i + BATCH_LIMIT)) {
        batch.set(
          firestore
            .collection('users')
            .doc(data.userId)
            .collection('dividends')
            .doc(id),
          data,
        );
      }
      await batch.commit();
    }
  }

  if (pending.length > 0 || state === undefined) {
    const nextState: DividendSyncState = {
      recordedThrough: today,
      updatedAt: new Date().toISOString(),
    };
    await syncRef.set(nextState);
  }

  return dividends;
}
