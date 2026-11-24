import { today as appToday } from '../shared/date';
import { ActiveAsset } from '../assets/asset.service';
import { logError, logWarn } from '../shared/logger';
import { b3DividendProvider } from './b3-dividend.provider';
import { DividendEvent, DividendProvider } from './dividend-provider';

export interface PaidDividendEvent {
  paymentDate: string; // YYYY-MM-DD
  rate: number;
  // Data-com (`lastDatePrior` da B3): quem tinha o ativo no fim desse dia
  // tem direito ao provento (#278). Ausente quando a fonte não informa.
  comDate?: string; // YYYY-MM-DD
}

export interface DividendInfo {
  monthlyDividend: number;
  paymentDate?: string; // YYYY-MM-DD
  // Data-com do provento de `monthlyDividend` e `paymentDate`: a agenda a usa
  // para não contar cotas compradas depois dela (#562).
  comDate?: string; // YYYY-MM-DD
  // Soma dos proventos pagos nos 12 meses até hoje. Ausente quando nenhum
  // evento tem data: sem ela não há como saber a periodicidade.
  annualDividend?: number;
  // Eventos pagos nos 12 meses até hoje, do mais antigo para o mais recente.
  // É daqui que o sync registra os proventos dos usuários (#112).
  paidEvents?: PaidDividendEvent[];
  // Anunciados e ainda não pagos que têm data-com, em ordem de pagamento. O
  // sync guarda a quantidade de cada usuário quando a data-com chega (#278).
  upcomingEvents?: PaidDividendEvent[];
}

function byPaymentDate(a: PaidDividendEvent, b: PaidDividendEvent): number {
  return a.paymentDate.localeCompare(b.paymentDate);
}

/** O provento que define o valor mensal: o de pagamento mais recente. */
function latestEvent(events: DividendEvent[]): DividendEvent {
  return events.reduce((latest, event) =>
    (event.paymentDate ?? '') > (latest.paymentDate ?? '') ? event : latest,
  );
}

/**
 * Separa os eventos datados em pagos em (hoje − 12 meses, hoje] e anunciados
 * com data-com. Os anunciados ficam fora dos pagos, senão um pagador mensal
 * somaria 13 meses.
 */
function splitEvents(
  events: DividendEvent[],
  today: Date,
): { paid: PaidDividendEvent[]; upcoming: PaidDividendEvent[] } | undefined {
  const dated = events.flatMap(
    ({ paymentDate, rate, comDate }): PaidDividendEvent[] =>
      paymentDate
        ? [{ paymentDate, rate, ...(comDate ? { comDate } : {}) }]
        : [],
  );
  if (dated.length === 0) {
    return undefined;
  }

  // O dia vem do fuso do produto: em UTC, uma execução depois das 21h em
  // Brasília abriria a janela no dia seguinte (issue #305).
  const end = appToday(today);
  const start = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  return {
    paid: dated
      .filter(({ paymentDate }) => paymentDate > start && paymentDate <= end)
      .sort(byPaymentDate),
    upcoming: dated
      .filter(({ paymentDate, comDate }) => paymentDate > end && comDate)
      .sort(byPaymentDate),
  };
}

function toDividendInfo(events: DividendEvent[], today: Date): DividendInfo {
  const latest = latestEvent(events);
  const info: DividendInfo = {
    monthlyDividend: latest.rate,
    ...(latest.paymentDate ? { paymentDate: latest.paymentDate } : {}),
    ...(latest.comDate ? { comDate: latest.comDate } : {}),
  };

  const split = splitEvents(events, today);
  if (split === undefined) {
    return info;
  }

  const { paid, upcoming } = split;
  const total = paid.reduce((sum, event) => sum + event.rate, 0);
  return {
    ...info,
    // Evita resíduos de ponto flutuante (ex.: 1.25 + 1.1 = 2.3499999...).
    // Seis casas porque a taxa por cota não é valor monetário: `roundCurrency`
    // a truncaria em centavos.
    annualDividend: Math.round(total * 1e6) / 1e6,
    paidEvents: paid,
    ...(upcoming.length > 0 ? { upcomingEvents: upcoming } : {}),
  };
}

/**
 * Proventos dos ativos do catálogo: o último provento, a soma de 12 meses e
 * os eventos que o sync registra (#112, #278).
 *
 * A fonte é a B3 Listados (#599). Nunca lança: sem fonte, os tickers ficam
 * sem provento conhecido, e a cotação segue sendo gravada.
 */
export async function fetchMonthlyDividends(
  assets: ActiveAsset[],
  today = new Date(),
  provider: DividendProvider = b3DividendProvider,
): Promise<Map<string, DividendInfo>> {
  if (assets.length === 0) {
    return new Map();
  }

  let events: Map<string, DividendEvent[]>;
  try {
    events = await provider.fetchDividendEvents(assets);
  } catch (error) {
    logError('fetchMonthlyDividends.failed', {
      provider: provider.name,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }

  const result = new Map<string, DividendInfo>();
  for (const [ticker, tickerEvents] of events) {
    if (tickerEvents.length > 0) {
      result.set(ticker, toDividendInfo(tickerEvents, today));
    }
  }

  const withoutPaymentDate = [...result.entries()]
    .filter(([, info]) => !info.paymentDate)
    .map(([ticker]) => ticker);
  if (withoutPaymentDate.length > 0) {
    logWarn('fetchMonthlyDividends.withoutPaymentDate', {
      tickers: withoutPaymentDate,
    });
  }

  return result;
}
