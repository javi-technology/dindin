import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { getMonthlyDividendHistory } from './quote-history.service';

export const MIN_MONTHS = 1;
export const MAX_MONTHS = 60;
export const DEFAULT_MONTHS = 12;

export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
}

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

    const entries = await getMonthlyDividendHistory(ticker, window);

    // O job só grava meses com provento numérico, mas um documento legado
    // pode não ter passado por essa validação.
    const history: DividendHistoryEntry[] = entries
      .filter(
        (entry) =>
          typeof entry.monthlyDividend === 'number' &&
          Number.isFinite(entry.monthlyDividend),
      )
      .map((entry) => ({
        date: entry.date,
        monthlyDividend: entry.monthlyDividend,
      }));

    res.json({ ticker, history });
  },
);
