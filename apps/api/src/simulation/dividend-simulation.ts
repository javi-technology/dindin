import { roundCurrency } from '../shared/numbers';
import { buyWholeSharesWithRemainder } from '../shared/whole-share-allocation';

/**
 * Motor de simulação de proventos (issue #395).
 *
 * Responde "quanto R$ X renderia de provento" sem tocar em rede nem em
 * Firestore: quem chama já traz preço e provento de cada ativo. A separação
 * existe porque a mesma conta serve à simulação por carteira sugerida e à
 * simulação por ativo, e porque projeção é a parte do produto que mais precisa
 * de teste — com dependência de infraestrutura ela só seria testável com
 * emulador.
 *
 * A base é sempre `quotes.monthlyDividend`, o **último provento real** da
 * Brapi. A média de 12 meses (`annualDividend / 12`) não entra aqui, nem como
 * fallback: ela suaviza o provento variável de FII e o número exibido deixaria
 * de existir em algum extrato.
 */

export type SimulationMode = 'reinvest' | 'withdraw';

/**
 * Dias além dos quais o último provento conhecido deixa de representar o
 * ativo. Dois meses cobrem o pagador mensal atrasado; a partir daí a tela
 * precisa avisar que a projeção repete um provento velho.
 */
export const STALE_DIVIDEND_DAYS = 90;

export interface SimulationAsset {
  ticker: string;
  /** Peso na carteira; sem peso em nenhum ativo, o valor é dividido igualmente. */
  weight?: number;
  /** Cotação atual; ausente deixa o ativo fora da alocação. */
  price?: number;
  /** Último provento real por cota (`quotes.monthlyDividend`). */
  monthlyDividend?: number;
  /** Data de pagamento do último provento (`YYYY-MM-DD`). */
  dividendPaymentDate?: string;
}

export interface SimulationInput {
  assets: SimulationAsset[];
  /** Valor a investir, já convertido para número. */
  amount: number;
  /** Horizonte em meses, a partir de 1. */
  months: number;
  mode: SimulationMode;
  /** Hoje, por padrão; injetável para o teste não depender do relógio. */
  referenceDate?: string;
}

export interface SimulationItem {
  ticker: string;
  price: number;
  monthlyDividend: number;
  /** Cotas compradas com o aporte inicial. */
  quantity: number;
  /** Cotas ao fim do horizonte; difere de `quantity` no reinvestimento. */
  finalQuantity: number;
  investedAmount: number;
  /** Renda do primeiro mês. */
  monthlyIncome: number;
  /** Renda somada no horizonte. */
  totalIncome: number;
  /** Sem cotação utilizável: fica fora da alocação. */
  missingPrice?: true;
  /** Sem último provento real conhecido: entra com renda zero, declarada. */
  missingDividend?: true;
  /** Último provento real anterior a `STALE_DIVIDEND_DAYS`. */
  staleDividend?: true;
}

/** Premissa da projeção, explícita no resultado em vez de embutida no número. */
export interface SimulationBasis {
  source: 'monthlyDividend';
  assumesRepetition: true;
  staleAfterDays: number;
}

export interface SimulationResult {
  amount: number;
  months: number;
  mode: SimulationMode;
  /** Valor que virou cota inteira. */
  allocatedAmount: number;
  /** Troco do aporte: não comprou cota e não rende. */
  unallocatedAmount: number;
  /** Renda do primeiro mês. */
  monthlyIncome: number;
  /** Renda somada no horizonte. */
  totalIncome: number;
  /** Proventos que viraram novas cotas (só no modo reinvestido). */
  reinvestedAmount: number;
  /** Proventos acumulados que não completaram uma cota ao fim do horizonte. */
  uninvestedIncome: number;
  byTicker: SimulationItem[];
  missingDividendTickers: string[];
  staleDividendTickers: string[];
  basis: SimulationBasis;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function validAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Provento velho demais para representar o ativo. Sem data de pagamento não
 * há como decidir, e o ativo não é marcado: o alerta existe para o caso
 * conhecido, não para a ausência de informação.
 */
function isStale(paymentDate: string | undefined, reference: Date): boolean {
  if (!paymentDate) return false;
  const paidAt = new Date(`${paymentDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(paidAt.getTime())) return false;
  return (
    (reference.getTime() - paidAt.getTime()) / MILLISECONDS_PER_DAY >
    STALE_DIVIDEND_DAYS
  );
}

interface AssetState {
  asset: SimulationAsset;
  ticker: string;
  price: number;
  dividend: number;
  weight: number;
  /** Candidato à compra de cota inteira; `quantity` é mutado ao alocar. */
  candidate: { price: number; priority: number; quantity: number };
  initialQuantity: number;
  totalIncome: number;
  missingPrice: boolean;
  missingDividend: boolean;
  staleDividend: boolean;
}

export function simulateDividendIncome(
  input: SimulationInput,
): SimulationResult {
  const amount = validAmount(input.amount);
  const months = Math.max(1, Math.trunc(input.months) || 1);
  const reference = input.referenceDate
    ? new Date(`${input.referenceDate.slice(0, 10)}T00:00:00Z`)
    : new Date();

  const states: AssetState[] = input.assets.map((asset, index) => {
    const price = validAmount(asset.price);
    // Provento zerado conta como desconhecido: é o valor que a cotação recebe
    // quando a Brapi não informou nada, e projetar zero calado esconderia do
    // usuário que aquele ativo simplesmente não entrou na conta.
    const dividend = validAmount(asset.monthlyDividend);
    return {
      asset,
      ticker: asset.ticker.toUpperCase(),
      price,
      dividend,
      weight: validAmount(asset.weight),
      candidate: { price, priority: index, quantity: 0 },
      initialQuantity: 0,
      totalIncome: 0,
      missingPrice: price === 0,
      missingDividend: dividend === 0,
      staleDividend:
        dividend > 0 && isStale(asset.dividendPaymentDate, reference),
    };
  });

  const allocatable = states.filter((state) => !state.missingPrice);
  const weightTotal = allocatable.reduce((total, s) => total + s.weight, 0);

  // Alvo por peso; sem peso declarado em nenhum ativo, parte igual para todos.
  for (const state of allocatable) {
    const share =
      weightTotal > 0
        ? (amount * state.weight) / weightTotal
        : amount / allocatable.length;
    state.candidate.quantity = Math.floor(share / state.price);
  }

  const spent = allocatable.reduce(
    (total, state) => total + state.candidate.quantity * state.price,
    0,
  );
  let cash = buyWholeSharesWithRemainder(
    allocatable.map((state) => state.candidate),
    roundCurrency(amount - spent),
  );
  const unallocatedAmount = cash;
  for (const state of allocatable) {
    state.initialQuantity = state.candidate.quantity;
  }

  const monthlyIncomeOf = (state: AssetState) =>
    state.candidate.quantity * state.dividend;

  const monthlyIncome = roundCurrency(
    states.reduce((total, state) => total + monthlyIncomeOf(state), 0),
  );

  // O troco do aporte fica de fora do reinvestimento: é dinheiro que o
  // usuário não chegou a investir, e somá-lo aos proventos faria a simulação
  // comprar cota com valor que ela mesma declarou como não alocado.
  let reinvestPool = 0;
  let reinvestedAmount = 0;
  for (let month = 0; month < months; month += 1) {
    for (const state of states) {
      state.totalIncome += monthlyIncomeOf(state);
    }
    if (input.mode !== 'reinvest') continue;
    reinvestPool = roundCurrency(
      reinvestPool +
        states.reduce((total, state) => total + monthlyIncomeOf(state), 0),
    );
    const before = reinvestPool;
    reinvestPool = buyWholeSharesWithRemainder(
      allocatable.map((state) => state.candidate),
      reinvestPool,
    );
    reinvestedAmount = roundCurrency(
      reinvestedAmount + (before - reinvestPool),
    );
  }
  cash = input.mode === 'reinvest' ? reinvestPool : 0;

  const byTicker: SimulationItem[] = states.map((state) => ({
    ticker: state.ticker,
    price: state.price,
    monthlyDividend: state.dividend,
    quantity: state.initialQuantity,
    finalQuantity: state.candidate.quantity,
    investedAmount: roundCurrency(state.initialQuantity * state.price),
    monthlyIncome: roundCurrency(state.initialQuantity * state.dividend),
    totalIncome: roundCurrency(state.totalIncome),
    ...(state.missingPrice ? { missingPrice: true as const } : {}),
    ...(state.missingDividend ? { missingDividend: true as const } : {}),
    ...(state.staleDividend ? { staleDividend: true as const } : {}),
  }));

  return {
    amount: input.amount,
    months,
    mode: input.mode,
    allocatedAmount: roundCurrency(amount - unallocatedAmount),
    unallocatedAmount,
    monthlyIncome,
    totalIncome: roundCurrency(
      states.reduce((total, state) => total + state.totalIncome, 0),
    ),
    reinvestedAmount,
    uninvestedIncome: cash,
    byTicker,
    missingDividendTickers: states
      .filter((state) => state.missingDividend)
      .map((state) => state.ticker),
    staleDividendTickers: states
      .filter((state) => state.staleDividend)
      .map((state) => state.ticker),
    basis: {
      source: 'monthlyDividend',
      assumesRepetition: true,
      staleAfterDays: STALE_DIVIDEND_DAYS,
    },
  };
}
