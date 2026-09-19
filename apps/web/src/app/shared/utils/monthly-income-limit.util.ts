import {
  MonthlyIncomeItem,
  MonthlyIncomeResponse,
  ScheduleTotals,
} from '../../core/services/dividend.service';
import { mergeMonthlyIncomeItems } from './monthly-income.util';

/**
 * Recorte gratuito da projeção por ativo e da agenda (#262).
 *
 * A API já recorta cada carteira; aqui o limite é reaplicado sobre o agregado,
 * senão duas carteiras mostrariam seis ativos. Os nomes/datas bloqueados vêm
 * da API só para contar o que está escondido — sem valores.
 */

export const FREE_TICKER_LIMIT = 3;
export const FREE_SCHEDULE_DATE_LIMIT = 2;

export interface FreeView {
  limited: boolean;
  byTicker: MonthlyIncomeItem[];
  scheduleItems: MonthlyIncomeItem[];
  hiddenCount: number;
  hiddenScheduleCount: number;
  /** Ativos sem data anunciada que a agenda deixou de listar. */
  hiddenWithoutDateCount: number;
  scheduleTotals: ScheduleTotals;
}

const MS_PER_DAY = 86400000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const round = (value: number): number => Math.round(value * 100) / 100;

function utcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function distanceInDays(date: string, today: Date): number | null {
  if (!DATE_REGEX.test(date)) return null;
  const timestamp = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return Math.abs(Math.round((timestamp - utcDay(today)) / MS_PER_DAY));
}

function sumScheduleTotals(responses: MonthlyIncomeResponse[]): ScheduleTotals {
  let upcomingTotal = 0;
  let paidTotal = 0;
  for (const response of responses) {
    upcomingTotal += response.scheduleTotals?.upcomingTotal ?? 0;
    paidTotal += response.scheduleTotals?.paidTotal ?? 0;
  }
  return { upcomingTotal: round(upcomingTotal), paidTotal: round(paidTotal) };
}

export function buildFreeView(
  responses: MonthlyIncomeResponse[],
  today: Date = new Date(),
): FreeView {
  const limited = responses.some((response) => response.limited);
  const scheduleTotals = sumScheduleTotals(responses);

  if (!limited) {
    return {
      limited: false,
      byTicker: mergeMonthlyIncomeItems(
        responses.flatMap((response) => response.byTicker),
      ),
      scheduleItems: [],
      hiddenCount: 0,
      hiddenScheduleCount: 0,
      hiddenWithoutDateCount: 0,
      scheduleTotals,
    };
  }

  // Um ticker cortado em uma carteira e mantido em outra viria com a soma
  // incompleta: melhor tratá-lo como bloqueado do que mostrar valor parcial.
  const hiddenTickerSet = new Set(
    responses.flatMap((response) => response.hiddenTickers ?? []),
  );
  const merged = mergeMonthlyIncomeItems(
    responses.flatMap((response) => response.byTicker),
  ).filter((item) => !hiddenTickerSet.has(item.ticker));
  const byTicker = [...merged]
    .sort(
      (a, b) =>
        b.monthlyIncome - a.monthlyIncome || a.ticker.localeCompare(b.ticker),
    )
    .slice(0, FREE_TICKER_LIMIT)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const knownTickers = new Set([
    ...merged.map((item) => item.ticker),
    ...hiddenTickerSet,
  ]);

  // Mesma regra na agenda: data cortada em uma carteira somaria só parte do
  // pagamento daquele dia.
  const hiddenDateSet = new Set(
    responses.flatMap((response) => response.hiddenPaymentDates ?? []),
  );
  const scheduleCandidates = mergeMonthlyIncomeItems(
    responses.flatMap((response) => response.scheduleItems ?? []),
  ).filter(
    (item) =>
      item.paymentDate &&
      !hiddenDateSet.has(item.paymentDate) &&
      !hiddenTickerSet.has(item.ticker),
  );

  const distanceByDate = new Map<string, number>();
  for (const item of scheduleCandidates) {
    const distance = distanceInDays(item.paymentDate!, today);
    if (distance !== null) distanceByDate.set(item.paymentDate!, distance);
  }
  // Empate de distância (ex.: ontem e amanhã) resolve pela data mais recente.
  const visibleDates = new Set(
    [...distanceByDate.entries()]
      .sort(([dateA, a], [dateB, b]) => a - b || dateB.localeCompare(dateA))
      .slice(0, FREE_SCHEDULE_DATE_LIMIT)
      .map(([date]) => date),
  );

  const knownDates = new Set([...distanceByDate.keys(), ...hiddenDateSet]);
  const hiddenWithoutDate = new Set(
    responses.flatMap((response) => response.hiddenScheduleTickers ?? []),
  );

  return {
    limited: true,
    byTicker,
    scheduleItems: scheduleCandidates.filter((item) =>
      visibleDates.has(item.paymentDate!),
    ),
    hiddenCount: knownTickers.size - byTicker.length,
    hiddenScheduleCount: knownDates.size - visibleDates.size,
    hiddenWithoutDateCount: hiddenWithoutDate.size,
    scheduleTotals,
  };
}
