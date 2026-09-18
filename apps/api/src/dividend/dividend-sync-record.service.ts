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
 * `dividendSync/{ticker}.recorded` guarda o valor por cota já registrado em
 * cada dia de pagamento. Um dia é reprocessado quando é novo ou quando a soma
 * mudou: um JCP publicado depois do dividendo do mesmo dia, ou um pagamento
 * que a Brapi inclui com data anterior ao último registro. O estado só é
 * gravado depois do commit, então uma falha é refeita na execução seguinte. E
 * só quem tem dia novo ou alterado custa as consultas de quem possui o ativo.
 */

const SYNC_COLLECTION = 'dividendSync';
// Limite de operações de um batch do Firestore.
const BATCH_LIMIT = 500;
// Id do registro mensal do job que existia antes deste sync (`YYYY-MM_TICKER`).
const LEGACY_AUTO_ID = /^\d{4}-\d{2}_/;

interface DividendSyncState {
  // YYYY-MM-DD → valor por cota registrado naquele dia. Espelha os eventos da
  // janela de 12 meses devolvida pela Brapi, então não cresce sem limite.
  recorded: Record<string, number>;
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

/**
 * Dividendo e JCP pagos no mesmo dia viram um único registro. Arredonda para
 * evitar resíduos de ponto flutuante (ex.: 1.25 + 0.5) na comparação com o
 * valor já registrado.
 */
function amountByPaymentDate(
  events: PaidDividendEvent[],
  today: string,
): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const { paymentDate, rate } of events) {
    if (paymentDate > today) continue;
    amounts.set(paymentDate, (amounts.get(paymentDate) ?? 0) + rate);
  }
  for (const [date, amount] of amounts) {
    amounts.set(date, Math.round(amount * 1e6) / 1e6);
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

  const amounts = amountByPaymentDate(events, today);
  // Na primeira execução não há como saber o que o job antigo já registrou:
  // os dias anteriores contam como registrados, em vez de refazer um ano.
  const recorded =
    state?.recorded ??
    Object.fromEntries([...amounts.entries()].filter(([date]) => date < today));
  const dates = [...amounts.keys()]
    .filter((date) => recorded[date] !== amounts.get(date))
    .sort();

  const dividends: Dividend[] = [];
  if (dates.length > 0) {
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
        const amountPerShare = amounts.get(paymentDate)!;
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

  if (dates.length > 0 || state === undefined) {
    const nextState: DividendSyncState = {
      recorded: Object.fromEntries(amounts),
      updatedAt: new Date().toISOString(),
    };
    await syncRef.set(nextState);
  }

  return dividends;
}
