import { z } from 'zod';
import { ASSET_TYPES, isAssetType } from '../assets/asset-type';
import { isValidPaymentDate } from '../dividend/monthly-report.service';

/**
 * Validação de entrada por schema (issue #298).
 *
 * Cada controller tinha o seu `validateXBody` escrito à mão, e as regras
 * divergiam entre rotas: `if (!name)` aceitava objeto, número ou string de
 * vários MB, enquanto a validação de posição já checava tipo e faixa. O que
 * chega no corpo é gravado no Firestore, então tipo e tamanho passam a ser
 * validados num lugar só, com as mensagens que a API já devolvia.
 */

/** Limite de nome — cabe num título de tela sem quebrar o layout. */
export const MAX_NAME_LENGTH = 120;

/** Limite de descrição livre. */
export const MAX_DESCRIPTION_LENGTH = 500;

/** Limite de ticker: os da B3 têm no máximo 6, com folga para BDR e afins. */
export const MAX_TICKER_LENGTH = 12;

/** Moeda única do produto (issue #266). */
export const SUPPORTED_CURRENCY = 'BRL';

type ParseResult<T> =
  { success: true; data: T } | { success: false; error: string };

/**
 * Valida o corpo e devolve a **primeira** mensagem de erro, no formato que a
 * API já usava (`{ error: '...' }`). Uma lista de erros mudaria o contrato
 * das rotas e do frontend sem necessidade.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const [issue] = result.error.issues;
  return {
    success: false,
    error: issue?.message ?? 'Corpo da requisição inválido',
  };
}

/**
 * Como `parseBody`, mas devolve **todas** as mensagens. O catálogo de ativos
 * junta as suas num único `{ error: 'a; b' }`, para a tela de admin mostrar
 * os problemas de uma vez em vez de um por requisição — formato preservado
 * da validação manual que existia antes.
 */
export function parseBodyAll<T extends z.ZodType>(
  schema: T,
  body: unknown,
): { success: true; data: z.infer<T> } | { success: false; errors: string[] } {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => issue.message),
  };
}

/** Texto obrigatório, sem espaços nas pontas e com tamanho máximo. */
export function nameField(label: string, max = MAX_NAME_LENGTH) {
  return z
    .string({ error: `${label} é obrigatório e deve ser um texto` })
    .trim()
    .min(1, { error: `${label} é obrigatório` })
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres` });
}

/** Texto livre e opcional. */
export function descriptionField(max = MAX_DESCRIPTION_LENGTH) {
  return z
    .string({ error: 'Descrição deve ser um texto' })
    .trim()
    .max(max, { error: `Descrição deve ter no máximo ${max} caracteres` })
    .optional();
}

/** Ticker normalizado em caixa alta. */
export function tickerField(label = 'Ticker') {
  return z
    .string({ error: `${label} é obrigatório e deve ser um texto não vazio` })
    .trim()
    .min(1, { error: `${label} é obrigatório e deve ser um texto não vazio` })
    .max(MAX_TICKER_LENGTH, {
      error: `${label} deve ter no máximo ${MAX_TICKER_LENGTH} caracteres`,
    })
    .transform((ticker) => ticker.toUpperCase());
}

/** Número finito e maior que zero. */
export function positiveNumberField(label: string) {
  return z
    .number({ error: `${label} é obrigatória e deve ser um número positivo` })
    .finite({ error: `${label} é obrigatória e deve ser um número positivo` })
    .positive({
      error: `${label} é obrigatória e deve ser um número positivo`,
    });
}

/** Número finito e não negativo. */
export function nonNegativeNumberField(label: string) {
  return z
    .number({
      error: `${label} é obrigatório e deve ser um número não negativo`,
    })
    .finite({
      error: `${label} é obrigatório e deve ser um número não negativo`,
    })
    .nonnegative({
      error: `${label} é obrigatório e deve ser um número não negativo`,
    });
}

/** Moeda aceita pelo produto. */
export function currencyField() {
  return z.literal(SUPPORTED_CURRENCY, {
    error: (issue) =>
      `Moeda '${String(issue.input)}' não é suportada. Valor aceito: ${SUPPORTED_CURRENCY}`,
  });
}

/** Tipo de ativo do catálogo (`ASSET_TYPES`, em `dindin-models`). */
export function assetTypeField(required = true) {
  const message = required
    ? `Tipo de ativo é obrigatório e deve ser um de: ${ASSET_TYPES.join(', ')}`
    : `Tipo de ativo deve ser um de: ${ASSET_TYPES.join(', ')}`;

  return z.custom<(typeof ASSET_TYPES)[number]>(isAssetType, {
    error: message,
  });
}

/** Data de pagamento no formato `YYYY-MM-DD`, validada como data real. */
export function paymentDateField() {
  const message =
    'Data de pagamento é obrigatória e deve estar no formato YYYY-MM-DD';

  return z
    .string({ error: message })
    .trim()
    .refine((value) => isValidPaymentDate(value), { error: message });
}
