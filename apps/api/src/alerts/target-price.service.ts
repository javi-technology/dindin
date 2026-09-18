import { getFirestore } from 'firebase-admin/firestore';
import { Alert, FridgeItem, Quote } from 'dindin-models';

const BATCH_SIZE = 10;

function userCollection(userId: string, collection: string) {
  return getFirestore().collection('users').doc(userId).collection(collection);
}

/** Preço por ticker (em caixa alta) das cotações atuais. */
export type QuotePrices = Map<string, number>;

function validPrice(price: unknown): number | undefined {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
    ? price
    : undefined;
}

export function alertId(fridgeId: string, ticker: string): string {
  return `${fridgeId}_${ticker.toUpperCase()}`;
}

/**
 * Carrega todas as cotações uma única vez. O job roda logo após
 * `updateQuotesScheduled`, então a coleção inteira é o conjunto relevante e
 * uma leitura por execução evita o N+1 de buscar `quotes/{ticker}` por item
 * (mesmo motivo da issue #221).
 */
export async function loadQuotePrices(): Promise<QuotePrices> {
  const snapshot = await getFirestore().collection('quotes').get();
  const prices: QuotePrices = new Map();

  for (const doc of snapshot.docs) {
    const price = validPrice((doc.data() as Quote).price);
    if (price !== undefined) {
      prices.set(doc.id.toUpperCase(), price);
    }
  }

  return prices;
}

type FridgeItemWithFridge = {
  item: FridgeItem;
  fridgeId: string;
  fridgeName: string;
};

async function fetchFridgeItems(
  userId: string,
): Promise<FridgeItemWithFridge[]> {
  const fridgesSnapshot = await userCollection(userId, 'fridges').get();
  const items: FridgeItemWithFridge[] = [];

  for (const fridgeDoc of fridgesSnapshot.docs) {
    const fridgeName = (fridgeDoc.data() as { name?: string }).name ?? '';
    const itemsSnapshot = await fridgeDoc.ref.collection('fridgeItems').get();

    for (const itemDoc of itemsSnapshot.docs) {
      items.push({
        item: { id: itemDoc.id, ...itemDoc.data() } as FridgeItem,
        fridgeId: fridgeDoc.id,
        fridgeName,
      });
    }
  }

  return items;
}

export interface TargetPriceCheckResult {
  /** Alertas criados nesta execução — entrada do envio de e-mail. */
  created: Alert[];
  /** Ids dos alertas rearmados nesta execução. */
  cleared: string[];
}

/**
 * Compara os itens da geladeira do usuário com a cotação atual e mantém a
 * coleção `alerts` em dia: cria alerta ao atingir o alvo, não duplica
 * enquanto houver alerta aberto e rearma quando o preço cai ou o item sai.
 */
export async function checkUserTargetPrices(
  userId: string,
  quotePrices?: QuotePrices,
  now = new Date(),
): Promise<TargetPriceCheckResult> {
  const [prices, fridgeItems, openAlertsSnapshot] = await Promise.all([
    quotePrices ? Promise.resolve(quotePrices) : loadQuotePrices(),
    fetchFridgeItems(userId),
    userCollection(userId, 'alerts').where('status', '==', 'open').get(),
  ]);

  const alerts = userCollection(userId, 'alerts');
  const openAlertIds = new Set(openAlertsSnapshot.docs.map((doc) => doc.id));
  const timestamp = now.toISOString();

  const created: Alert[] = [];
  const cleared: string[] = [];
  const stillOnTarget = new Set<string>();

  for (const { item, fridgeId, fridgeName } of fridgeItems) {
    const ticker =
      typeof item.ticker === 'string' ? item.ticker.toUpperCase() : '';
    const targetPrice = validPrice(item.targetPrice);
    const currentPrice = ticker ? prices.get(ticker) : undefined;

    if (!ticker || targetPrice === undefined || currentPrice === undefined) {
      continue;
    }

    const id = alertId(fridgeId, ticker);
    if (currentPrice < targetPrice) continue;

    stillOnTarget.add(id);
    if (openAlertIds.has(id)) continue;

    const alert: Alert = {
      id,
      fridgeId,
      fridgeName,
      ticker,
      targetPrice,
      currentPrice,
      status: 'open',
      createdAt: timestamp,
    };

    await alerts.doc(id).set(alert);
    created.push(alert);
  }

  // Alerta aberto cujo item não está mais no alvo (preço caiu ou o item saiu
  // da geladeira) é rearmado: se voltar ao alvo, um novo alerta é criado e o
  // usuário é avisado de novo.
  for (const id of openAlertIds) {
    if (stillOnTarget.has(id)) continue;
    await alerts.doc(id).update({ status: 'cleared', clearedAt: timestamp });
    cleared.push(id);
  }

  return { created, cleared };
}

/** Roda a verificação para todos os usuários — usado pelo scheduler. */
export async function checkAllTargetPrices(now = new Date()): Promise<void> {
  const [quotePrices, userDocuments] = await Promise.all([
    loadQuotePrices(),
    getFirestore().collection('users').listDocuments(),
  ]);

  let created = 0;
  let failed = 0;

  for (let i = 0; i < userDocuments.length; i += BATCH_SIZE) {
    const batch = userDocuments.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((userDocument) =>
        checkUserTargetPrices(userDocument.id, quotePrices, now),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        created += result.value.created.length;
      } else {
        failed += 1;
        console.error(
          `[checkAllTargetPrices] Erro ao verificar ${batch[index].id}:`,
          { message: (result.reason as Error).message },
        );
      }
    });
  }

  console.log(
    `[checkAllTargetPrices] Concluído. ${created} alerta(s) criado(s), ${failed} falha(s).`,
  );
}
