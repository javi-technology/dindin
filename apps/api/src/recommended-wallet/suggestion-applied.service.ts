import { getFirestore } from 'firebase-admin/firestore';
import { AiSuggestion, AiSuggestionAppliedItem } from 'dindin-models';

export interface AppliedItemInput {
  ticker?: unknown;
  fallbackFor?: unknown;
  quantity?: unknown;
  price?: unknown;
}

type StatusError = Error & { statusCode?: number; expose?: boolean };

function createError(message: string, statusCode: number): StatusError {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeTicker(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim().toUpperCase()
    : undefined;
}

/**
 * Só compras podem ser aplicadas: o próprio item `buy` ou uma alternativa de
 * redistribuição do FII de origem (`fallbackFor`).
 */
function isApplicable(
  suggestion: AiSuggestion,
  ticker: string,
  fallbackFor: string | undefined,
): boolean {
  if (fallbackFor === undefined) {
    return suggestion.items.some(
      (item) => item.action === 'buy' && item.ticker.toUpperCase() === ticker,
    );
  }
  return suggestion.items.some(
    (item) =>
      item.action === 'buy' &&
      item.ticker.toUpperCase() === fallbackFor &&
      (item.fallbackAllocations ?? []).some(
        (alt) => alt.ticker.toUpperCase() === ticker,
      ),
  );
}

/**
 * Marca uma compra da Sugestão do mês como lançada na carteira (#276). A
 * leitura e a gravação ficam na mesma transação, para que dois cliques
 * simultâneos não marquem a mesma compra duas vezes.
 */
export async function recordAppliedItem(
  uid: string,
  suggestionId: string,
  input: AppliedItemInput,
): Promise<AiSuggestion> {
  const ticker = normalizeTicker(input.ticker);
  const fallbackFor =
    input.fallbackFor === undefined
      ? undefined
      : normalizeTicker(input.fallbackFor);
  if (
    !ticker ||
    (input.fallbackFor !== undefined && !fallbackFor) ||
    !isPositiveNumber(input.quantity) ||
    !isPositiveNumber(input.price)
  ) {
    throw createError('Ticker, quantidade e preço são obrigatórios', 400);
  }
  const { quantity, price } = input;

  const ref = getFirestore()
    .collection('users')
    .doc(uid)
    .collection('aiSuggestions')
    .doc(suggestionId);

  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw createError('Sugestão não encontrada', 404);

    const { input: _input, ...data } = snapshot.data() as AiSuggestion & {
      input?: unknown;
    };
    const suggestion: AiSuggestion = { ...data, id: snapshot.id };

    if (!isApplicable(suggestion, ticker, fallbackFor)) {
      throw createError('Ticker não faz parte das compras da sugestão', 400);
    }

    const appliedItems = suggestion.appliedItems ?? [];
    if (
      appliedItems.some(
        (item) =>
          item.ticker.toUpperCase() === ticker &&
          item.fallbackFor?.toUpperCase() === fallbackFor,
      )
    ) {
      throw createError('Item já aplicado na carteira', 409);
    }

    const applied: AiSuggestionAppliedItem = {
      ticker,
      ...(fallbackFor === undefined ? {} : { fallbackFor }),
      quantity,
      price,
      appliedAt: new Date().toISOString(),
    };
    const updated = [...appliedItems, applied];
    tx.update(ref, { appliedItems: updated });

    return { ...suggestion, appliedItems: updated };
  });
}
