import { MonthlyIncomeItem } from '../../core/services/dividend.service';

export interface PaymentScheduleDay {
  /** Data de pagamento no formato `YYYY-MM-DD`. */
  date: string;
  total: number;
  items: MonthlyIncomeItem[];
  /** Dias até o pagamento; negativo quando já ocorreu. */
  daysUntil: number;
  /** Rótulo relativo em pt-BR (ex: "hoje", "amanhã", "em 3 dias"). */
  relativeLabel: string;
}

export interface PaymentSchedule {
  upcoming: PaymentScheduleDay[];
  paid: PaymentScheduleDay[];
  withoutDate: MonthlyIncomeItem[];
  upcomingTotal: number;
  paidTotal: number;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Converte `YYYY-MM-DD` em timestamp UTC de meia-noite. Tratar a data como
 * data (e não como instante) evita que o fuso local desloque o dia.
 */
function toUtcDay(date: string): number | null {
  if (!DATE_REGEX.test(date)) {
    return null;
  }

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

function relativeLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'hoje';
  if (daysUntil === 1) return 'amanhã';
  if (daysUntil === -1) return 'ontem';
  return daysUntil > 0 ? `em ${daysUntil} dias` : `há ${-daysUntil} dias`;
}

/**
 * Organiza a projeção mensal por data de pagamento, separando o que ainda
 * vai cair do que já foi pago e do que não tem data anunciada.
 */
export function buildPaymentSchedule(
  items: MonthlyIncomeItem[],
  today: Date = new Date(),
): PaymentSchedule {
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const withoutDate: MonthlyIncomeItem[] = [];
  const byDate = new Map<string, MonthlyIncomeItem[]>();

  for (const item of items) {
    const timestamp = item.paymentDate ? toUtcDay(item.paymentDate) : null;
    if (timestamp === null) {
      withoutDate.push(item);
      continue;
    }
    const group = byDate.get(item.paymentDate!) ?? [];
    group.push(item);
    byDate.set(item.paymentDate!, group);
  }

  const days: PaymentScheduleDay[] = [...byDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, group]) => {
      const daysUntil = Math.round((toUtcDay(date)! - todayUtc) / MS_PER_DAY);
      return {
        date,
        items: group,
        total: round(
          group.reduce((sum, item) => sum + item.monthlyIncome, 0),
        ),
        daysUntil,
        relativeLabel: relativeLabel(daysUntil),
      };
    });

  const upcoming = days.filter((day) => day.daysUntil >= 0);
  const paid = days.filter((day) => day.daysUntil < 0);
  const sumTotals = (list: PaymentScheduleDay[]): number =>
    round(list.reduce((sum, day) => sum + day.total, 0));

  return {
    upcoming,
    paid,
    withoutDate,
    upcomingTotal: sumTotals(upcoming),
    paidTotal: sumTotals(paid),
  };
}
