import { getFirestore } from 'firebase-admin/firestore';
import { roundCurrency, validQuantity } from '../shared/numbers';
import { Dividend } from 'dindin-models';
import { dividendsCollection } from '../firestore/paths';
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
 *
 * Quem tem direito ao provento é quem tinha o ativo na data-com, não no dia do
 * pagamento (#278). Quando a data-com de um evento anunciado chega, o sync
 * guarda a quantidade de cada usuário em
 * `dividendSync/{ticker}/snapshots/{comDate}`; o sync roda às 18h30, depois do
 * fechamento, então a foto é a posição do fim da data-com. No pagamento, vale
 * a quantidade da foto: quem vendeu no intervalo ainda recebe, quem comprou
 * não. Evento sem data-com, ou cuja foto não existe (data-com anterior a esta
 * versão), segue com a quantidade do dia do pagamento.
 */

const SYNC_COLLECTION = 'dividendSync';
const SNAPSHOTS_COLLECTION = 'snapshots';
// Limite de operações de um batch do Firestore.
const BATCH_LIMIT = 500;
// Id do registro mensal do job que existia antes deste sync (`YYYY-MM_TICKER`).
const LEGACY_AUTO_ID = /^\d{4}-\d{2}_/;

interface DividendSyncState {
  // YYYY-MM-DD → valor por cota registrado naquele dia. Espelha os eventos da
  // janela de 12 meses devolvida pela Brapi, então não cresce sem limite.
  recorded: Record<string, number>;
  // Datas-com com foto guardada. Espelha as datas-com dos eventos recebidos:
  // a foto que sai da janela é apagada.
  snapshots?: string[];
  updatedAt: string;
}

interface QuantitySnapshot {
  quantities: Record<string, number>; // uid → quantidade na data-com
  takenAt: string;
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

/**
 * Quantidade de um usuário com direito a um evento: a da foto da data-com,
 * quando existe; senão, a atual.
 */
function entitledQuantity(
  userId: string,
  event: PaidDividendEvent,
  current: Map<string, number>,
  snapshots: Map<string, Record<string, number>>,
): number {
  const snapshot = event.comDate ? snapshots.get(event.comDate) : undefined;
  return snapshot ? (snapshot[userId] ?? 0) : (current.get(userId) ?? 0);
}

async function loadSnapshots(
  ref: FirebaseFirestore.CollectionReference,
  comDates: string[],
): Promise<Map<string, Record<string, number>>> {
  const docs = await Promise.all(comDates.map((date) => ref.doc(date).get()));
  const snapshots = new Map<string, Record<string, number>>();
  docs.forEach((doc, index) => {
    const data = doc.data() as QuantitySnapshot | undefined;
    if (doc.exists && data) snapshots.set(comDates[index], data.quantities);
  });
  return snapshots;
}

export async function recordPaidDividends(
  ticker: string,
  events: PaidDividendEvent[],
  today: string,
): Promise<Dividend[]> {
  const firestore = getFirestore();
  const syncRef = firestore.collection(SYNC_COLLECTION).doc(ticker);
  const snapshotsRef = syncRef.collection(SNAPSHOTS_COLLECTION);
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

  let current: Map<string, number> | undefined;
  const currentQuantities = async () =>
    (current ??= await quantityByUser(ticker));

  // Foto das quantidades nas datas-com que chegaram, antes do pagamento.
  const stored = new Set(state?.snapshots ?? []);
  const toSnapshot = [
    ...new Set(
      events
        .filter(
          ({ comDate, paymentDate }) =>
            comDate && comDate <= today && paymentDate > today,
        )
        .map(({ comDate }) => comDate!),
    ),
  ]
    .filter((date) => !stored.has(date))
    .sort();
  if (toSnapshot.length > 0) {
    // A foto é gravada antes do estado: se uma execução anterior falhou
    // depois dela, a foto certa já existe e não pode virar a de hoje.
    const existing = await Promise.all(
      toSnapshot.map((date) => snapshotsRef.doc(date).get()),
    );
    const missing = toSnapshot.filter((_, index) => !existing[index].exists);
    if (missing.length > 0) {
      const snapshot: QuantitySnapshot = {
        quantities: Object.fromEntries(await currentQuantities()),
        takenAt: new Date().toISOString(),
      };
      await Promise.all(
        missing.map((date) => snapshotsRef.doc(date).set(snapshot)),
      );
    }
    toSnapshot.forEach((date) => stored.add(date));
  }

  const dividends: Dividend[] = [];
  if (dates.length > 0) {
    const eventsByDate = new Map<string, PaidDividendEvent[]>();
    for (const event of events) {
      if (!amounts.has(event.paymentDate)) continue;
      eventsByDate.set(event.paymentDate, [
        ...(eventsByDate.get(event.paymentDate) ?? []),
        event,
      ]);
    }
    const comDates = [
      ...new Set(
        dates.flatMap((date) =>
          eventsByDate
            .get(date)!
            .flatMap(({ comDate }) =>
              comDate && stored.has(comDate) ? [comDate] : [],
            ),
        ),
      ),
    ];

    const [quantities, blocked, snapshots] = await Promise.all([
      currentQuantities(),
      blockedMonthsByUser(ticker, dates[0], dates[dates.length - 1]),
      loadSnapshots(snapshotsRef, comDates),
    ]);
    // Quem vendeu depois da data-com só aparece na foto.
    const users = new Set([
      ...quantities.keys(),
      ...[...snapshots.values()].flatMap((snapshot) => Object.keys(snapshot)),
    ]);

    const now = new Date().toISOString();
    for (const userId of [...users].sort((a, b) => a.localeCompare(b))) {
      for (const paymentDate of dates) {
        if (blocked.get(userId)?.has(monthOf(paymentDate))) continue;
        const parts = eventsByDate.get(paymentDate)!.map((event) => ({
          rate: event.rate,
          quantity: entitledQuantity(userId, event, quantities, snapshots),
        }));
        const quantity = Math.max(...parts.map((part) => part.quantity));
        if (quantity <= 0) continue;
        const amountPerShare = amounts.get(paymentDate)!;
        // Proventos do mesmo dia com datas-com diferentes podem ter
        // quantidades diferentes: cada um soma pela sua, e `quantity` fica
        // com a maior.
        const sameQuantity = parts.every((part) => part.quantity === quantity);
        const totalAmount = roundCurrency(
          sameQuantity
            ? amountPerShare * quantity
            : parts.reduce((sum, part) => sum + part.rate * part.quantity, 0),
        );
        dividends.push({
          id: `${paymentDate}_${ticker}`,
          userId,
          ticker,
          amountPerShare,
          quantity,
          totalAmount,
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
        batch.set(dividendsCollection(data.userId).doc(id), data);
      }
      await batch.commit();
    }
  }

  // A foto cuja data-com saiu da janela de eventos não é mais usada.
  const referenced = new Set(events.flatMap(({ comDate }) => comDate ?? []));
  const pruned = [...stored].filter((date) => !referenced.has(date));
  await Promise.all(pruned.map((date) => snapshotsRef.doc(date).delete()));
  const snapshotDates = [...stored]
    .filter((date) => referenced.has(date))
    .sort();

  if (
    dates.length > 0 ||
    state === undefined ||
    toSnapshot.length > 0 ||
    pruned.length > 0
  ) {
    const nextState: DividendSyncState = {
      recorded: Object.fromEntries(amounts),
      ...(snapshotDates.length > 0 ? { snapshots: snapshotDates } : {}),
      updatedAt: new Date().toISOString(),
    };
    await syncRef.set(nextState);
  }

  return dividends;
}
