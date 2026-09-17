import { getFirestore } from 'firebase-admin/firestore';
import { MonthlyDividendHistory, QuoteHistory } from 'dindin-models';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte os snapshots diários de `quotes/{ticker}/history` em um registro
 * por mês, com o snapshot válido mais recente de cada mês.
 *
 * Usado apenas no backfill (#255): a partir dele o job mantém a coleção
 * mensal atualizada sozinho.
 */
export function buildMonthlyEntries(
  snapshots: QuoteHistory[],
): MonthlyDividendHistory[] {
  const updatedAt = new Date().toISOString();
  const byMonth = new Map<string, MonthlyDividendHistory>();

  for (const snapshot of snapshots) {
    if (
      typeof snapshot.date !== 'string' ||
      !DATE_REGEX.test(snapshot.date) ||
      typeof snapshot.monthlyDividend !== 'number' ||
      !Number.isFinite(snapshot.monthlyDividend)
    ) {
      continue;
    }

    const month = snapshot.date.slice(0, 7);
    const current = byMonth.get(month);
    if (!current || snapshot.date >= current.date) {
      byMonth.set(month, {
        month,
        date: snapshot.date,
        monthlyDividend: snapshot.monthlyDividend,
        updatedAt,
      });
    }
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Popula `quotes/{ticker}/dividendHistory` a partir do histórico diário.
 *
 * Idempotente: o id do documento é o mês, então reexecutar apenas sobrescreve
 * com o mesmo conteúdo.
 */
export async function backfillTickerDividendHistory(
  ticker: string,
): Promise<number> {
  const firestore = getFirestore();
  const quoteRef = firestore.collection('quotes').doc(ticker);
  const snapshot = await quoteRef.collection('history').get();

  const entries = buildMonthlyEntries(
    snapshot.docs.map((doc) => doc.data() as QuoteHistory),
  );

  for (const entry of entries) {
    await quoteRef.collection('dividendHistory').doc(entry.month).set(entry);
  }

  return entries.length;
}

/**
 * Tickers a processar no backfill.
 *
 * Sem filtro, processa todos. Com um ticker informado, restringe a ele — útil
 * para validar a migração em um ativo antes de rodar no catálogo inteiro.
 * Ticker inexistente falha em vez de rodar em silêncio sobre nada, porque a
 * causa provável é erro de digitação.
 */
export function resolveTickers(
  allTickers: string[],
  requested?: string,
): string[] {
  const normalized = (requested ?? '').trim().toUpperCase();
  if (normalized.length === 0) {
    return allTickers;
  }

  if (!allTickers.includes(normalized)) {
    throw new Error(`Ticker ${normalized} não encontrado na coleção 'quotes'.`);
  }

  return [normalized];
}
