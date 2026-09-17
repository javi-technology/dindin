import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { getQuoteHistory } from './quote-history.service';

export const MIN_MONTHS = 1;
export const MAX_MONTHS = 60;
export const DEFAULT_MONTHS = 12;

export interface DividendHistoryEntry {
  date: string;
  monthlyDividend: number;
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
    let limit = DEFAULT_MONTHS;

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
      limit = parsed;
    }

    const history = await getQuoteHistory(ticker, limit);

    // O Firestore devolve do mais recente para o mais antigo; o gráfico lê da
    // esquerda para a direita, então a ordem é invertida aqui.
    const entries: DividendHistoryEntry[] = history
      .filter(
        (item) =>
          typeof item.monthlyDividend === 'number' &&
          Number.isFinite(item.monthlyDividend),
      )
      .map((item) => ({
        date: item.date,
        monthlyDividend: item.monthlyDividend,
      }))
      .reverse();

    res.json({ ticker, history: entries });
  },
);
