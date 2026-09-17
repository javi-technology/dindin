import { Request, Response } from 'express';
import { QuoteHistory } from 'dindin-models';
import { asyncHandler } from '../middleware/async-handler';
import { getQuoteHistorySince } from './quote-history.service';

export const MIN_MONTHS = 1;
export const MAX_MONTHS = 60;
export const DEFAULT_MONTHS = 12;

export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
}

/** Primeiro dia do mês que inicia uma janela de `months` meses terminando hoje. */
export function windowStartDate(months: number, today = new Date()): string {
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1), 1),
  );
  return start.toISOString().slice(0, 10);
}

function isValidEntry(entry: QuoteHistory): boolean {
  return (
    typeof entry.monthlyDividend === 'number' &&
    Number.isFinite(entry.monthlyDividend) &&
    typeof entry.date === 'string'
  );
}

/**
 * Reduz os snapshots a um ponto por mês.
 *
 * O job de cotações grava um snapshot por dia, repetindo o mesmo
 * `monthlyDividend` até a Brapi anunciar um novo provento. Sem essa
 * agregação o gráfico mostraria os últimos N dias — uma linha plana, em que
 * a tendência entre pagamentos nunca aparece.
 *
 * Recebe os snapshots do mais recente para o mais antigo, então o primeiro
 * válido de cada mês é o que representa o mês.
 */
function aggregateByMonth(entries: QuoteHistory[]): DividendHistoryEntry[] {
  const byMonth = new Map<string, DividendHistoryEntry>();

  for (const entry of entries) {
    if (!isValidEntry(entry)) {
      continue;
    }
    const month = entry.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, {
        date: entry.date,
        monthlyDividend: entry.monthlyDividend,
      });
    }
  }

  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Histórico de provento por cota de um ticker, alimentando o sparkline da
 * tela de Proventos. A coleção `quotes/{ticker}/history` já é populada pelo
 * job de atualização de cotações.
 */
export const getDividendHistory = asyncHandler(
  'getDividendHistory',
  async (req: Request, res: Response) => {
    const ticker = (req.params.ticker ?? '').trim().toUpperCase();
    if (ticker.length === 0) {
      res
        .status(400)
        .json({ error: 'Ticker is required and must be a non-empty string' });
      return;
    }

    const { months } = req.query;
    let window = DEFAULT_MONTHS;

    if (months !== undefined) {
      const parsed = Number(months);
      if (
        !Number.isInteger(parsed) ||
        parsed < MIN_MONTHS ||
        parsed > MAX_MONTHS
      ) {
        res.status(400).json({
          error: `Months must be an integer between ${MIN_MONTHS} and ${MAX_MONTHS}`,
        });
        return;
      }
      window = parsed;
    }

    const snapshots = await getQuoteHistorySince(
      ticker,
      windowStartDate(window),
    );

    // A janela já limita o período, mas um histórico com datas futuras (ou
    // relógio adiantado no job) poderia render mais meses que o pedido.
    const history = aggregateByMonth(snapshots).slice(-window);

    res.json({ ticker, history });
  },
);
