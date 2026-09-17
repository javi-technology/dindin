import { getFirestore } from 'firebase-admin/firestore';
import { MonthlyDividendHistory, Quote, QuoteHistory } from 'dindin-models';

function quotesCollection() {
  return getFirestore().collection('quotes');
}

function historyCollection(ticker: string) {
  return quotesCollection().doc(ticker).collection('history');
}

function dividendHistoryCollection(ticker: string) {
  return quotesCollection().doc(ticker).collection('dividendHistory');
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function historyDocId(): string {
  // Usa timestamp ISO com segundos para evitar sobrescrita no mesmo dia
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function saveQuoteHistory(
  ticker: string,
  price: number,
  monthlyDividend: number | undefined,
  source = 'brapi',
  dividendPaymentDate?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const date = todayDate();
  const docId = historyDocId();

  const quoteRef = quotesCollection().doc(ticker);

  let resolvedMonthlyDividend = monthlyDividend;
  let resolvedPaymentDate = dividendPaymentDate;
  if (resolvedMonthlyDividend === undefined) {
    const existing = (await quoteRef.get()).data() as Quote | undefined;
    resolvedMonthlyDividend = existing?.monthlyDividend ?? 0;
    resolvedPaymentDate = existing?.dividendPaymentDate;
  }

  const quoteData: Quote = {
    ticker,
    price,
    monthlyDividend: resolvedMonthlyDividend,
    ...(resolvedPaymentDate && { dividendPaymentDate: resolvedPaymentDate }),
    updatedAt: now,
    source,
  };

  const historyData: QuoteHistory = {
    date,
    price,
    monthlyDividend: resolvedMonthlyDividend,
    source,
  };

  await quoteRef.set(quoteData);
  await historyCollection(ticker).doc(docId).set(historyData);
  await saveMonthlyDividendHistory(
    ticker,
    resolvedMonthlyDividend,
    resolvedPaymentDate,
    date,
    now,
  );
}

/**
 * Registra o provento por cota no mês do **pagamento**, sobrescrevendo o
 * documento a cada execução do job.
 *
 * O `history` acumula um snapshot por dia porque o preço muda todo dia; o
 * provento só muda quando um novo é anunciado. Manter um documento por mês
 * aqui é o que permite ao endpoint de histórico ler ~12 documentos por ticker
 * em vez de varrer ~365 e descartar quase todos.
 *
 * A chave é o mês do pagamento, não o da execução: a Brapi devolve sempre o
 * último provento anunciado, então num pagador trimestral os jobs dos meses
 * seguintes ainda veem o mesmo provento. Chavear pela execução registraria
 * três pagamentos onde houve um.
 */
async function saveMonthlyDividendHistory(
  ticker: string,
  monthlyDividend: number,
  paymentDate: string | undefined,
  today: string,
  updatedAt: string,
): Promise<void> {
  if (
    typeof monthlyDividend !== 'number' ||
    !Number.isFinite(monthlyDividend)
  ) {
    return;
  }

  // Sem data anunciada (ou em formato inesperado), o mês corrente é a melhor
  // aproximação disponível.
  const date = isIsoDate(paymentDate) ? paymentDate : today;
  const month = date.slice(0, 7);
  const data: MonthlyDividendHistory = {
    month,
    date,
    monthlyDividend,
    updatedAt,
  };

  await dividendHistoryCollection(ticker).doc(month).set(data);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Proventos mensais de um ticker, do mais antigo para o mais recente.
 *
 * Como há um documento por mês, o `limit` da consulta corresponde exatamente
 * ao número de pontos devolvidos.
 */
export async function getMonthlyDividendHistory(
  ticker: string,
  months: number,
): Promise<MonthlyDividendHistory[]> {
  const snapshot = await dividendHistoryCollection(ticker)
    .orderBy('month', 'desc')
    .limit(months)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as MonthlyDividendHistory)
    .reverse();
}

/** Máximo de documentos aceitos numa chamada de `getAll` do Firestore. */
const GET_ALL_LIMIT = 500;

/**
 * Resolve o preço de vários tickers numa única ida ao Firestore (issue #221).
 *
 * A versão anterior lia um ticker por vez. Chamada em `Promise.all` sobre a
 * lista de tickers de uma carteira, o custo e a latência crescem linearmente
 * com a diversificação — 30 ativos distintos custavam 30 leituras a cada
 * listagem de posições. `getAll` resolve o mesmo em uma viagem.
 *
 * Tickers repetidos são deduplicados e os sem cotação ficam **fora** do Map,
 * em vez de virarem zero: quem chama distingue "sem cotação" de "vale zero".
 */
export async function getQuotePricesByTicker(
  tickers: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(tickers)];
  const prices = new Map<string, number>();

  // getAll() rejeita chamada sem nenhum documento.
  if (unique.length === 0) return prices;

  const firestore = getFirestore();

  for (let index = 0; index < unique.length; index += GET_ALL_LIMIT) {
    const batch = unique.slice(index, index + GET_ALL_LIMIT);
    const snapshots = await firestore.getAll(
      ...batch.map((ticker) => quotesCollection().doc(ticker)),
    );

    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const { price } = snapshot.data() as Quote;
      if (typeof price === 'number') prices.set(snapshot.id, price);
    });
  }

  return prices;
}

export async function getQuoteHistory(
  ticker: string,
  limit = 30,
): Promise<QuoteHistory[]> {
  const snapshot = await historyCollection(ticker)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as QuoteHistory);
}
