import { z } from 'zod';

/**
 * Validação da entrada da simulação (issue #396).
 *
 * O valor chega como texto de um campo monetário brasileiro, então `1.500,55`
 * precisa virar `1500.55` antes de qualquer conta — é o mesmo formato que os
 * campos de preço do app já aceitam. As mensagens ficam em português porque
 * chegam à tela.
 */

/** Teto do aporte simulado: acima disso é engano de digitação, não simulação. */
export const MAX_SIMULATION_AMOUNT = 100_000_000;

/** Horizonte máximo: 30 anos. Além disso a premissa de repetição não se sustenta. */
export const MAX_SIMULATION_MONTHS = 360;

const AMOUNT_ERROR =
  'Valor a investir é obrigatório e deve ser um número positivo';
const MONTHS_ERROR = `Horizonte deve ser um número inteiro de meses entre 1 e ${MAX_SIMULATION_MONTHS}`;

/**
 * Converte o texto do campo monetário. Só descarta o ponto quando há vírgula:
 * `1.500,55` é milhar com decimal, mas `1500.55` é decimal internacional e
 * limpar o ponto viraria 150055.
 */
export function parseAmountInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? trimmed : parsed;
}

const amountField = z.preprocess(
  parseAmountInput,
  z
    .number({ error: AMOUNT_ERROR })
    .finite({ error: AMOUNT_ERROR })
    .positive({ error: AMOUNT_ERROR })
    .max(MAX_SIMULATION_AMOUNT, {
      error: `Valor a investir deve ser no máximo R$ ${MAX_SIMULATION_AMOUNT.toLocaleString(
        'pt-BR',
      )}`,
    }),
);

const monthsField = z
  .number({ error: MONTHS_ERROR })
  .int({ error: MONTHS_ERROR })
  .min(1, { error: MONTHS_ERROR })
  .max(MAX_SIMULATION_MONTHS, { error: MONTHS_ERROR });

// O modo é opcional e o padrão é o saque: sem escolha explícita, projetar
// reinvestimento entregaria um número maior do que o usuário pediu.
const modeField = z
  .enum(['reinvest', 'withdraw'], {
    error: "Modo de reinvestimento deve ser 'reinvest' ou 'withdraw'",
  })
  .default('withdraw');

const providerField = z
  .string({ error: 'Provedor deve ser um texto' })
  .trim()
  .min(1, { error: 'Provedor deve ser um texto' })
  .optional();

const monthField = z
  .string({ error: 'Mês deve estar no formato YYYY-MM' })
  .trim()
  .regex(/^\d{4}-\d{2}$/, { error: 'Mês deve estar no formato YYYY-MM' })
  .optional();

const tabField = z
  .enum(['renda', 'ganho'], { error: "Aba deve ser 'renda' ou 'ganho'" })
  .default('renda');

export const walletSimulationSchema = z.object({
  amount: amountField,
  months: monthsField,
  mode: modeField,
  provider: providerField,
  month: monthField,
  tab: tabField,
});

export type WalletSimulationInput = z.infer<typeof walletSimulationSchema>;
