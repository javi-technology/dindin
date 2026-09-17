import { MonthlyIncomeItem } from './monthly-income.service';

/**
 * Recorte gratuito da projeção por ativo e da agenda de pagamentos (#262).
 *
 * O corte acontece na API, e não só na tela, para que o detalhamento pago não
 * saia no payload de quem não assina.
 */

/** Ativos liberados na projeção por ativo sem o entitlement `projections`. */
export const FREE_TICKER_LIMIT = 3;

/** Datas de pagamento liberadas na agenda sem o entitlement `projections`. */
export const FREE_SCHEDULE_DATE_LIMIT = 2;

export interface ScheduleTotals {
  upcomingTotal: number;
  paidTotal: number;
}

export interface LimitedMonthlyIncome {
  /** Ativos liberados na projeção por ativo. */
  byTicker: MonthlyIncomeItem[];
  /** Ativos das datas de pagamento liberadas na agenda. */
  scheduleItems: MonthlyIncomeItem[];
  /** Tickers omitidos em `byTicker` — a web soma os de todas as carteiras. */
  hiddenTickers: string[];
  /** Datas de pagamento omitidas na agenda, em ordem cronológica. */
  hiddenPaymentDates: string[];
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Converte `YYYY-MM-DD` em timestamp UTC de meia-noite — mesma semântica de
 * `payment-schedule.util` na web: data é data, não instante.
 */
function toUtcDay(date: string): number | null {
  if (!DATE_REGEX.test(date)) return null;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? timestamp
    : null;
}

function daysUntil(date: string, today: Date): number | null {
  const timestamp = toUtcDay(date);
  if (timestamp === null) return null;
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((timestamp - todayUtc) / MS_PER_DAY);
}

/**
 * Totais da agenda sobre **todos** os ativos. O não assinante vê a agenda
 * recortada, mas "Já pagos" e "A receber" continuam valores reais.
 */
export function computeScheduleTotals(
  items: MonthlyIncomeItem[],
  today: Date = new Date(),
): ScheduleTotals {
  let upcomingTotal = 0;
  let paidTotal = 0;

  for (const item of items) {
    const days = item.paymentDate ? daysUntil(item.paymentDate, today) : null;
    if (days === null) continue;
    if (days >= 0) upcomingTotal += item.monthlyIncome;
    else paidTotal += item.monthlyIncome;
  }

  return { upcomingTotal: round(upcomingTotal), paidTotal: round(paidTotal) };
}

export function limitMonthlyIncome(
  items: MonthlyIncomeItem[],
  today: Date = new Date(),
): LimitedMonthlyIncome {
  const byIncome = [...items].sort(
    (a, b) =>
      b.monthlyIncome - a.monthlyIncome || a.ticker.localeCompare(b.ticker),
  );
  const visible = byIncome.slice(0, FREE_TICKER_LIMIT);
  const hiddenTickers = byIncome
    .slice(FREE_TICKER_LIMIT)
    .map((item) => item.ticker)
    .sort((a, b) => a.localeCompare(b));

  const distanceByDate = new Map<string, number>();
  for (const item of items) {
    const days = item.paymentDate ? daysUntil(item.paymentDate, today) : null;
    if (days === null) continue;
    distanceByDate.set(item.paymentDate!, Math.abs(days));
  }

  // Empate de distância (ex.: ontem e amanhã) resolve pela data mais recente.
  const dates = [...distanceByDate.entries()]
    .sort(([dateA, a], [dateB, b]) => a - b || dateB.localeCompare(dateA))
    .map(([date]) => date);
  const visibleDates = new Set(dates.slice(0, FREE_SCHEDULE_DATE_LIMIT));
  const hiddenPaymentDates = dates
    .slice(FREE_SCHEDULE_DATE_LIMIT)
    .sort((a, b) => a.localeCompare(b));

  return {
    byTicker: visible.sort((a, b) => a.ticker.localeCompare(b.ticker)),
    scheduleItems: items.filter(
      (item) => item.paymentDate && visibleDates.has(item.paymentDate),
    ),
    hiddenTickers,
    hiddenPaymentDates,
  };
}
