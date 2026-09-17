import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { getMonthlyDividendHistory } from './quote-history.service';

export const MIN_MONTHS = 1;
export const MAX_MONTHS = 60;
export const DEFAULT_MONTHS = 12;
export const MAX_TICKERS = 60;

export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
}

/** Meses pedidos, ou `null` quando o parâmetro é inválido. */
function parseMonths(months: unknown): number | null {
  if (months === undefined) {
    return DEFAULT_MONTHS;
  }

  const parsed = Number(months);
  return Number.isInteger(parsed) && parsed >= MIN_MONTHS && parsed <= MAX_MONTHS
    ? parsed
    : null;
}

async function historyOf(
  ticker: string,
  months: number,
): Promise<DividendHistoryEntry[]> {
  const entries = await getMonthlyDividendHistory(ticker, months);

  // O job só grava meses com provento numérico, mas um documento legado
  // pode não ter passado por essa validação.
  return entries
    .filter(
      (entry) =>
        typeof entry.monthlyDividend === 'number' &&
        Number.isFinite(entry.monthlyDividend),
    )
    .map((entry) => ({
      date: entry.date,
      monthlyDividend: entry.monthlyDividend,
    }));
}

/**
 * Histórico de vários tickers numa requisição.
 *
 * A tela de Proventos monta um sparkline por ativo; uma requisição por ticker
 * faria uma carteira diversificada disparar dezenas de chamadas ao abrir a
 * tela, esbarrando no rate limit de 100/min por IP (ver #255).
 */
export const getDividendHistoryBatch = asyncHandler(
  'getDividendHistoryBatch',
  async (req: Request, res: Response) => {
    const { tickers } = req.query;

    if (typeof tickers !== 'string' || tickers.trim().length === 0) {
      res.status(400).json({
        error: 'Tickers is required and must be a comma-separated list',
      });
      return;
    }

    const requested = [
      ...new Set(
        tickers
          .split(',')
          .map((ticker) => ticker.trim().toUpperCase())
          .filter((ticker) => ticker.length > 0),
      ),
    ];

    if (requested.length === 0 || requested.length > MAX_TICKERS) {
      res.status(400).json({
        error: `Tickers must contain between 1 and ${MAX_TICKERS} items`,
      });
      return;
    }

    const months = parseMonths(req.query.months);
    if (months === null) {
      res.status(400).json({
        error: `Months must be an integer between ${MIN_MONTHS} and ${MAX_MONTHS}`,
      });
      return;
    }

    const histories = await Promise.all(
      requested.map((ticker) => historyOf(ticker, months)),
    );

    const byTicker: Record<string, DividendHistoryEntry[]> = {};
    requested.forEach((ticker, index) => {
      byTicker[ticker] = histories[index];
    });

    res.json({ byTicker });
  },
);

/**
 * Histórico de provento por cota de um ticker, alimentando o sparkline da
 * tela de Proventos.
 *
 * Lê `quotes/{ticker}/dividendHistory`, que guarda um documento por mês — o
 * `limit` corresponde ao número de pontos devolvidos, sem varrer os snapshots
 * diários de `history` (ver #255).
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

    const months = parseMonths(req.query.months);
    if (months === null) {
      res.status(400).json({
        error: `Months must be an integer between ${MIN_MONTHS} and ${MAX_MONTHS}`,
      });
      return;
    }

    res.json({ ticker, history: await historyOf(ticker, months) });
  },
);
