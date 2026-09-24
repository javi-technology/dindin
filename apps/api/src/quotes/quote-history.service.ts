import { MonthlyDividendHistory, Quote, QuoteHistory } from 'dindin-models';
import {
  quoteDividendHistoryCollection as dividendHistoryCollection,
  quoteHistoryCollection as historyCollection,
  quotesCollection,
} from '../firestore/paths';
import { today } from '../shared/date';

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
  annualDividend?: number,
  quotedAt?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const date = today();
  const docId = historyDocId();

  const quoteRef = quotesCollection().doc(ticker);

  let resolvedMonthlyDividend = monthlyDividend;
  let resolvedPaymentDate = dividendPaymentDate;
  let resolvedAnnualDividend = annualDividend;
  if (resolvedMonthlyDividend === undefined) {
    const existing = (await quoteRef.get()).data() as Quote | undefined;
    resolvedMonthlyDividend = existing?.monthlyDividend ?? 0;
    resolvedPaymentDate = existing?.dividendPaymentDate;
    resolvedAnnualDividend = existing?.annualDividend;
  }

  const quoteData: Quote = {
    ticker,
    price,
    monthlyDividend: resolvedMonthlyDividend,
    ...(resolvedPaymentDate && { dividendPaymentDate: resolvedPaymentDate }),
    ...(resolvedAnnualDividend !== undefined && {
      annualDividend: resolvedAnnualDividend,
    }),
    updatedAt: now,
    ...(quotedAt && { quotedAt }),
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
 * Grava um preço reconciliado (issue #389), sem tocar em proventos.
 *
 * O `saveQuoteHistory` regrava, junto com o preço, o documento mensal de
 * proventos — que só deveria mudar quando um provento novo é anunciado. A
 * reconciliação noturna roda todo dia e corrige apenas o fechamento, então
 * passar por lá reescreveria aquele registro (e o seu `updatedAt`) sem
 * nenhum fato novo por trás.
 *
 * Os campos de provento vêm da cotação já gravada e são repassados como
 * estão: relê-los custaria a consulta à agenda que este job existe para
 * evitar.
 */
export async function saveReconciledPrice(
  ticker: string,
  price: number,
  stored: Quote | undefined,
  quotedAt: string | undefined,
  source = 'brapi',
): Promise<void> {
  const now = new Date().toISOString();
  const monthlyDividend = stored?.monthlyDividend ?? 0;

  const quoteData: Quote = {
    ticker,
    price,
    monthlyDividend,
    ...(stored?.dividendPaymentDate && {
      dividendPaymentDate: stored.dividendPaymentDate,
    }),
    ...(stored?.annualDividend !== undefined && {
      annualDividend: stored.annualDividend,
    }),
    updatedAt: now,
    ...(quotedAt && { quotedAt }),
    source,
  };

  const historyData: QuoteHistory = {
    date: today(),
    price,
    monthlyDividend,
    source,
  };

  await quotesCollection().doc(ticker).set(quoteData);
  await historyCollection(ticker).doc(historyDocId()).set(historyData);
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
