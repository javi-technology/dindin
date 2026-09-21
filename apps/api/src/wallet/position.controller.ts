import { Request, Response } from 'express';

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { FridgeItem, Position } from 'dindin-models';
import { ASSET_TYPES, isAssetType } from '../assets/asset-type';
import { assetExists } from '../assets/asset.service';
import { getQuotePricesByTicker } from '../quotes/quote-prices';
import { asyncHandler } from '../middleware/async-handler';
import { HttpError } from '../shared/http-error';
import {
  uid,
  fridgeItemsCollection,
  positionsCollection,
  fridgesCollection,
  walletsCollection,
} from '../firestore/paths';

/**
 * Resolve o `currentPrice` de cada posição a partir da collection `quotes`
 * no momento da leitura, em vez de depender de um valor denormalizado
 * gravado em cada posição pelo job agendado. Isso elimina a necessidade
 * de escrever em toda posição de todo usuário a cada atualização de
 * cotação (ver issue #86).
 */
async function withCurrentPrices(positions: Position[]): Promise<Position[]> {
  const priceByTicker = await getQuotePricesByTicker(
    positions.map((position) => position.ticker),
  );

  // Sempre sobrescreve currentPrice com o valor resolvido de `quotes` (ou
  // undefined, removido do JSON de resposta), mesmo que o documento ainda
  // tenha um valor antigo denormalizado no Firestore.
  return positions.map((position) => ({
    ...position,
    currentPrice: priceByTicker.get(position.ticker),
  }));
}

function validatePositionBody(
  body: Partial<Position>,
  allowPartial = false,
): { valid: false; error: string } | { valid: true } {
  const { ticker, quantity, averagePrice, assetType } = body;

  if (!allowPartial || ticker !== undefined) {
    if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
      return {
        valid: false,
        error: 'Ticker é obrigatório e deve ser um texto não vazio',
      };
    }
  }

  if (!allowPartial || quantity !== undefined) {
    if (
      typeof quantity !== 'number' ||
      quantity <= 0 ||
      !Number.isFinite(quantity)
    ) {
      return {
        valid: false,
        error: 'Quantidade é obrigatória e deve ser um número positivo',
      };
    }
  }

  if (!allowPartial || averagePrice !== undefined) {
    if (
      typeof averagePrice !== 'number' ||
      averagePrice < 0 ||
      !Number.isFinite(averagePrice)
    ) {
      return {
        valid: false,
        error: 'Preço médio é obrigatório e deve ser um número não negativo',
      };
    }
  }

  if (!allowPartial || assetType !== undefined) {
    if (!isAssetType(assetType)) {
      return {
        valid: false,
        error: `Tipo de ativo é obrigatório e deve ser um de: ${ASSET_TYPES.join(', ')}`,
      };
    }
  }

  // currentPrice não é mais aceito no cadastro/atualização de posições:
  // é resolvido a partir de `quotes/{ticker}` na leitura (issue #86). Um
  // valor enviado pelo cliente é silenciosamente ignorado por
  // createPosition/updatePosition, então não é validado aqui.

  if (body.inFridge !== undefined && typeof body.inFridge !== 'boolean') {
    return {
      valid: false,
      error: 'inFridge deve ser booleano',
    };
  }

  if (
    body.targetPrice !== undefined &&
    body.targetPrice !== null &&
    (typeof body.targetPrice !== 'number' ||
      body.targetPrice < 0 ||
      !Number.isFinite(body.targetPrice))
  ) {
    return {
      valid: false,
      error: 'Preço-alvo deve ser um número não negativo',
    };
  }

  return { valid: true };
}

export const listPositions = asyncHandler(
  'listPositions',
  async (req: Request, res: Response) => {
    const walletId = req.params.walletId;
    const snapshot = await positionsCollection(uid(req), walletId).get();
    const positions = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    );
    res.json(await withCurrentPrices(positions));
  },
);

export const createPosition = asyncHandler(
  'createPosition',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const walletId = req.params.walletId;
    const body = req.body as Partial<Position>;

    const validation = validatePositionBody(body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Sem esta checagem a posição nasce órfã sob uma carteira inexistente:
    // a API não a alcança, porque navega a partir das carteiras, mas o
    // registro automático de proventos a encontra pelo collection group e
    // lança provento de um ativo que o usuário não vê (issue #296). É a
    // mesma verificação que `createItem` já faz com a geladeira.
    const walletDoc = await walletsCollection(userId).doc(walletId).get();
    if (!walletDoc.exists) {
      res.status(404).json({ error: 'Carteira não encontrada' });
      return;
    }

    const ticker = body.ticker!.trim().toUpperCase();
    if (!(await assetExists(ticker))) {
      res.status(400).json({
        error: 'Ticker não encontrado no catálogo de ativos suportados',
      });
      return;
    }

    const now = new Date().toISOString();
    // currentPrice não é mais aceito na criação: o preço é resolvido a
    // partir da collection `quotes` no momento da leitura (ver issue #86).
    const positionData: Omit<Position, 'id'> = {
      walletId,
      ticker,
      assetType: body.assetType!,
      quantity: body.quantity!,
      averagePrice: body.averagePrice!,
      inFridge: body.inFridge ?? false,
      createdAt: now,
      updatedAt: now,
    };

    if (body.targetPrice !== undefined) {
      positionData.targetPrice = body.targetPrice;
    }

    const docRef = await positionsCollection(userId, walletId).add(
      positionData,
    );
    res.status(201).json({ id: docRef.id, ...positionData });
  },
);

export const getPosition = asyncHandler(
  'getPosition',
  async (req: Request, res: Response) => {
    const { walletId, id } = req.params;
    const doc = await positionsCollection(uid(req), walletId).doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Posição não encontrada' });
      return;
    }

    const position = { id: doc.id, ...doc.data() } as Position;
    const [withPrice] = await withCurrentPrices([position]);
    res.json(withPrice);
  },
);

export const updatePosition = asyncHandler(
  'updatePosition',
  async (req: Request, res: Response) => {
    const { walletId, id } = req.params;
    const positionRef = positionsCollection(uid(req), walletId).doc(id);
    const doc = await positionRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Posição não encontrada' });
      return;
    }

    const body = req.body as Partial<Position>;
    const validation = validatePositionBody(body, true);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    let ticker: string | undefined;
    if (body.ticker !== undefined) {
      ticker = body.ticker.trim().toUpperCase();
      if (!(await assetExists(ticker))) {
        res.status(400).json({
          error: 'Ticker não encontrado no catálogo de ativos suportados',
        });
        return;
      }
    }

    const updates: Partial<Position> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    // currentPrice não é mais aceito na atualização: o preço é resolvido
    // a partir da collection `quotes` no momento da leitura (issue #86).
    if (ticker !== undefined) updates.ticker = ticker;
    if (body.assetType !== undefined) updates.assetType = body.assetType;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.averagePrice !== undefined)
      updates.averagePrice = body.averagePrice;
    if (body.inFridge !== undefined) updates.inFridge = body.inFridge;
    if (body.targetPrice !== undefined) {
      if (body.targetPrice === null) {
        (updates as Record<string, unknown>).targetPrice = FieldValue.delete();
      } else {
        updates.targetPrice = body.targetPrice;
      }
    }

    await positionRef.update(updates);

    const updatedPosition = { id, ...doc.data(), ...updates } as Position;
    const [withPrice] = await withCurrentPrices([updatedPosition]);
    res.json(withPrice);
  },
);

export const deletePosition = asyncHandler(
  'deletePosition',
  async (req: Request, res: Response) => {
    const { walletId, id } = req.params;
    const positionRef = positionsCollection(uid(req), walletId).doc(id);
    const doc = await positionRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Posição não encontrada' });
      return;
    }

    await positionRef.delete();
    res.status(204).send();
  },
);

export const moveToFridge = asyncHandler(
  'moveToFridge',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const { walletId, id: positionId } = req.params;
    const { fridgeId, targetPrice } = req.body as {
      fridgeId?: string;
      targetPrice?: number;
    };

    // Validação dos campos obrigatórios
    if (!fridgeId || typeof fridgeId !== 'string') {
      res.status(400).json({ error: 'fridgeId é obrigatório' });
      return;
    }

    if (
      targetPrice === undefined ||
      targetPrice === null ||
      typeof targetPrice !== 'number' ||
      targetPrice < 0 ||
      !Number.isFinite(targetPrice)
    ) {
      res.status(400).json({
        error: 'targetPrice é obrigatório e deve ser um número não negativo',
      });
      return;
    }

    const positionRef = positionsCollection(userId, walletId).doc(positionId);
    const fridgeRef = fridgesCollection(userId).doc(fridgeId);
    const fridgeItemRef = fridgeItemsCollection(userId, fridgeId).doc();

    // A posição é lida dentro da transação, não antes dela: `delete` de um
    // documento que já sumiu não falha, então com a leitura fora duas
    // chamadas simultâneas passavam pela checagem de existência e cada uma
    // criava um item, duplicando a quantidade na geladeira (issue #295).
    const fridgeItemData = await getFirestore().runTransaction(
      async (transaction) => {
        const [positionDoc, fridgeDoc] = await Promise.all([
          transaction.get(positionRef),
          transaction.get(fridgeRef),
        ]);

        if (!positionDoc.exists)
          throw HttpError.notFound('Posição não encontrada');
        if (!fridgeDoc.exists)
          throw HttpError.notFound('Geladeira não encontrada');

        const positionData = positionDoc.data() as Position;
        const now = new Date().toISOString();

        // currentPrice não é mais carregado da posição: passa a ser
        // resolvido a partir da collection `quotes` na leitura (issue #86).
        const data: Omit<FridgeItem, 'id'> = {
          fridgeId,
          ticker: positionData.ticker,
          quantity: positionData.quantity,
          transferredPrice: positionData.averagePrice,
          targetPrice,
          assetType: positionData.assetType,
          createdAt: now,
          updatedAt: now,
        };

        transaction.delete(positionRef);
        transaction.set(fridgeItemRef, data);

        return data;
      },
    );

    res.status(201).json({ id: fridgeItemRef.id, ...fridgeItemData });
  },
);
