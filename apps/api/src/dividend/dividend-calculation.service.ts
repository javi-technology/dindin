import { Dividend, Position } from 'dindin-models';
import type {
  DividendYieldResponse,
  TickerDividendYield,
} from 'dindin-shared-types';
import { logError } from '../shared/logger';

/**
 * Cálculo de proventos: projeção mensal e dividend yield (issue #225).
 *
 * Esta matemática vivia dentro do `dividend.controller`, misturada aos
 * handlers HTTP — inconsistente com o próprio domínio, que já tinha
 * `monthly-income.service` e o registro de proventos extraídos. Sendo
 * função pura sobre arrays, aqui ela é testável sem subir o Express.
 */

export interface MonthlyDividendProjection {
  ticker: string;
  amountPerShare: number;
  quantity: number;
  monthlyAmount: number;
}

export type { TickerDividendYield };

/** Resposta de `GET /api/wallets/:walletId/dividend-yield`. */
export type WalletDividendYieldResponse = DividendYieldResponse;

/** Meses considerados na anualização da renda de proventos. */
const MONTHS_PER_YEAR = 12;

function isValidDividend(dividend: Dividend): boolean {
  return (
    typeof dividend.ticker === 'string' &&
    dividend.ticker.length > 0 &&
    typeof dividend.paymentDate === 'string' &&
    typeof dividend.amountPerShare === 'number' &&
    Number.isFinite(dividend.amountPerShare) &&
    dividend.amountPerShare >= 0 &&
    typeof dividend.quantity === 'number' &&
    Number.isFinite(dividend.quantity) &&
    dividend.quantity > 0
  );
}

/** Uniformiza o ticker para agrupar `hglg11`, ` HGLG11 ` e `HGLG11`. */
export function normalizeTicker(ticker: unknown): string {
  return typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
}

function roundYield(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Quantidade válida da posição; qualquer coisa fora disso conta como zero. */
function validQuantity(position: Position): number {
  return typeof position.quantity === 'number' &&
    Number.isFinite(position.quantity) &&
    position.quantity > 0
    ? position.quantity
    : 0;
}

/**
 * Indexa o provento mais recente de cada ticker.
 *
 * Desempata pela data de pagamento e, quando ela coincide, pelo `createdAt` —
 * dois lançamentos no mesmo dia valem o mais novo. Proventos mal formados são
 * logados e descartados, para não contaminar a projeção.
 */
export function latestDividendByTickerMap(
  dividends: Dividend[],
): Map<string, Dividend> {
  const byTicker = new Map<string, Dividend>();

  for (const dividend of dividends) {
    if (!isValidDividend(dividend)) {
      logError('latestDividendByTicker.malformedDividend', {
        id: dividend.id,
        ticker: dividend.ticker,
        paymentDate: dividend.paymentDate,
        amountPerShare: dividend.amountPerShare,
        quantity: dividend.quantity,
      });
      continue;
    }

    const ticker = normalizeTicker(dividend.ticker);
    const current = byTicker.get(ticker);

    if (!current) {
      byTicker.set(ticker, dividend);
      continue;
    }

    const isNewerDate = dividend.paymentDate > current.paymentDate;
    const sameDate = dividend.paymentDate === current.paymentDate;
    const isNewerCreatedAt =
      (dividend.createdAt ?? '') > (current.createdAt ?? '');

    if (isNewerDate || (sameDate && isNewerCreatedAt)) {
      byTicker.set(ticker, dividend);
    }
  }

  return byTicker;
}

/** Soma a quantidade de cada ticker, que pode aparecer em várias carteiras. */
export function quantityByTicker(positions: Position[]): Map<string, number> {
  const byTicker = new Map<string, number>();

  for (const position of positions) {
    const ticker = normalizeTicker(position.ticker);
    const current = byTicker.get(ticker) ?? 0;
    byTicker.set(ticker, current + validQuantity(position));
  }

  return byTicker;
}

/**
 * Projeta a renda mensal por ticker, cruzando o último provento com a
 * quantidade em carteira. Ticker sem posição fica fora: provento de ativo já
 * vendido não projeta renda futura.
 */
export function latestDividendByTicker(
  dividends: Dividend[],
  positions: Position[],
): MonthlyDividendProjection[] {
  const latestByTicker = latestDividendByTickerMap(dividends);
  const quantities = quantityByTicker(positions);

  return [...latestByTicker.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, dividend]) => {
      const quantity = quantities.get(ticker) ?? 0;
      return {
        ticker,
        amountPerShare: dividend.amountPerShare,
        quantity,
        monthlyAmount: dividend.amountPerShare * quantity,
      };
    })
    .filter((projection) => projection.quantity > 0);
}

/**
 * Calcula o dividend yield anualizado por posição e o total da carteira.
 *
 * O yield parte do último provento conhecido, extrapolado por 12 meses. Sem
 * valor investido o yield é zero, e não `Infinity`: dividir renda por um
 * denominador zerado não é informação, é erro de cálculo exposto na tela.
 */
export function computeDividendYield(
  positions: Position[],
  dividends: Dividend[],
): WalletDividendYieldResponse {
  const latestByTicker = latestDividendByTickerMap(dividends);

  const byTicker: TickerDividendYield[] = [];
  let totalAnnualIncome = 0;
  let totalCurrentValue = 0;

  for (const position of positions) {
    const unitPrice = position.currentPrice ?? position.averagePrice ?? 0;
    const quantity = validQuantity(position);
    const currentValue = quantity * unitPrice;

    const latestDividend = latestByTicker.get(normalizeTicker(position.ticker));
    const amountPerShare =
      latestDividend &&
      typeof latestDividend.amountPerShare === 'number' &&
      Number.isFinite(latestDividend.amountPerShare) &&
      latestDividend.amountPerShare >= 0
        ? latestDividend.amountPerShare
        : 0;

    const annualIncome = amountPerShare * quantity * MONTHS_PER_YEAR;
    const dividendYield =
      currentValue > 0 && Number.isFinite(annualIncome)
        ? (annualIncome / currentValue) * 100
        : 0;

    byTicker.push({
      ticker: position.ticker,
      annualIncome,
      currentValue,
      yield: roundYield(dividendYield),
    });

    totalAnnualIncome += annualIncome;
    totalCurrentValue += currentValue;
  }

  byTicker.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    byTicker,
    total: {
      annualIncome: totalAnnualIncome,
      currentValue: totalCurrentValue,
      yield:
        totalCurrentValue > 0
          ? roundYield((totalAnnualIncome / totalCurrentValue) * 100)
          : 0,
    },
  };
}
