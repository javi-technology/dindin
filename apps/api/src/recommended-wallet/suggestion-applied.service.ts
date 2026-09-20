import { getFirestore } from 'firebase-admin/firestore';
import type {
  AiSuggestion,
  AiSuggestionAppliedItem,
  Asset,
  Position,
} from 'dindin-models';
import { isAssetType } from '../assets/asset-type';
import { positionsCollection, walletsCollection } from '../firestore/paths';

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

/** Preço médio após a compra, arredondado a 2 casas, como na tela. */
function weightedAveragePrice(
  currentQuantity: number,
  currentPrice: number,
  addedQuantity: number,
  purchasePrice: number,
): number {
  const average =
    (currentQuantity * currentPrice + addedQuantity * purchasePrice) /
    (currentQuantity + addedQuantity);
  return Math.round(average * 100) / 100;
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
 * Lança uma compra da Sugestão do mês na carteira e a marca como aplicada
 * (#276). Posição e marca ficam na mesma transação: um item já aplicado (409)
 * não chega a mexer na carteira, dois cliques ou duas abas não lançam a mesma
 * compra duas vezes, e uma falha não deixa a compra lançada sem a marca.
 *
 * A carteira é a da sugestão. Com posição do ticker, soma a quantidade e
 * recalcula o preço médio ponderado; sem posição, cria uma com o tipo do
 * catálogo de ativos.
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

    const walletRef = walletsCollection(uid).doc(suggestion.walletId);
    const walletPositions = positionsCollection(uid, suggestion.walletId);
    const [walletSnapshot, positionSnapshot, assetSnapshot] = await Promise.all(
      [
        tx.get(walletRef),
        tx.get(walletPositions.where('ticker', '==', ticker).limit(1)),
        tx.get(getFirestore().collection('assets').doc(ticker)),
      ],
    );
    if (!walletSnapshot.exists) {
      throw createError('Carteira não encontrada', 404);
    }

    const now = new Date().toISOString();
    if (!positionSnapshot.empty) {
      const positionDoc = positionSnapshot.docs[0];
      const current = positionDoc.data() as Position;
      tx.update(positionDoc.ref, {
        quantity: current.quantity + quantity,
        averagePrice: weightedAveragePrice(
          current.quantity,
          current.averagePrice,
          quantity,
          price,
        ),
        updatedAt: now,
      });
    } else {
      const asset = assetSnapshot.data() as Partial<Asset> | undefined;
      if (!assetSnapshot.exists || asset?.active !== true) {
        throw createError(
          'Ticker não encontrado no catálogo de ativos suportados',
          400,
        );
      }
      const position: Omit<Position, 'id'> = {
        walletId: suggestion.walletId,
        ticker,
        assetType: isAssetType(asset.assetType) ? asset.assetType : 'OTHER',
        quantity,
        averagePrice: price,
        inFridge: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.create(walletPositions.doc(), position);
    }

    const applied: AiSuggestionAppliedItem = {
      ticker,
      ...(fallbackFor === undefined ? {} : { fallbackFor }),
      quantity,
      price,
      appliedAt: now,
    };
    const updated = [...appliedItems, applied];
    tx.update(ref, { appliedItems: updated });

    return { ...suggestion, appliedItems: updated };
  });
}
