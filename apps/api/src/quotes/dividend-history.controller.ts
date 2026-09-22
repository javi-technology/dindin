import { Request, Response } from 'express';
import type { DividendHistoryEntry } from 'dindin-shared-types';
import { asyncHandler } from '../middleware/async-handler';
import { getMonthlyDividendHistory } from './quote-history.service';
import { routeParam } from '../shared/route-params';

export const MIN_MONTHS = 1;
export const MAX_MONTHS = 60;
export const DEFAULT_MONTHS = 12;
export const MAX_TICKERS = 60;

export type { DividendHistoryEntry };

/** Meses pedidos, ou `null` quando o parâmetro é inválido. */
function parseMonths(months: unknown): number | null {
  if (months === undefined) {
    return DEFAULT_MONTHS;
  }

  const parsed = Number(months);
  return Number.isInteger(parsed) &&
    parsed >= MIN_MONTHS &&
    parsed <= MAX_MONTHS
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
        error:
          'Tickers é obrigatório e deve ser uma lista separada por vírgula',
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
        error: `Tickers deve conter entre 1 e ${MAX_TICKERS} itens`,
      });
      return;
    }

    const months = parseMonths(req.query.months);
    if (months === null) {
      res.status(400).json({
        error: `Months deve ser um inteiro entre ${MIN_MONTHS} e ${MAX_MONTHS}`,
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
    const ticker = (routeParam(req, 'ticker') ?? '').trim().toUpperCase();
    if (ticker.length === 0) {
      res
        .status(400)
        .json({ error: 'Ticker é obrigatório e deve ser um texto não vazio' });
      return;
    }

    const months = parseMonths(req.query.months);
    if (months === null) {
      res.status(400).json({
        error: `Months deve ser um inteiro entre ${MIN_MONTHS} e ${MAX_MONTHS}`,
      });
      return;
    }

    res.json({ ticker, history: await historyOf(ticker, months) });
  },
);
