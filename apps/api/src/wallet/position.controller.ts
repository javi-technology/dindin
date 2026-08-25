import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Position, AssetType, FridgeItem } from 'dindin-models';
import { AuthRequest } from '../middleware/auth.middleware';
import { assetExists } from '../assets/asset.service';
import { getQuotePrice } from '../quotes/quote-history.service';

const ASSET_TYPES = new Set<AssetType>([
  'FII',
  'STOCK',
  'ETF',
  'REIT',
  'OTHER',
]);

function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

function positionsCollection(userId: string, walletId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc(walletId)
    .collection('positions');
}

function isValidAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPES.has(value as AssetType);
}

/**
 * Resolve o `currentPrice` de cada posição a partir da collection `quotes`
 * no momento da leitura, em vez de depender de um valor denormalizado
 * gravado em cada posição pelo job agendado. Isso elimina a necessidade
 * de escrever em toda posição de todo usuário a cada atualização de
 * cotação (ver issue #86).
 */
async function withCurrentPrices(positions: Position[]): Promise<Position[]> {
  const tickers = [...new Set(positions.map((position) => position.ticker))];
  const prices = await Promise.all(
    tickers.map((ticker) => getQuotePrice(ticker)),
  );
  const priceByTicker = new Map(
    tickers.map((ticker, i) => [ticker, prices[i]]),
  );

  // Sempre sobrescreve currentPrice com o valor resolvido de `quotes`
  // (ou undefined, removido do JSON de resposta), mesmo que a posição
  // ainda tenha um valor antigo denormalizado no Firestore.
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
        error: 'Ticker is required and must be a non-empty string',
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
        error: 'Quantity is required and must be a positive number',
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
        error: 'Average price is required and must be a non-negative number',
      };
    }
  }

  if (!allowPartial || assetType !== undefined) {
    if (!isValidAssetType(assetType)) {
      return {
        valid: false,
        error: `Asset type is required and must be one of: ${[...ASSET_TYPES].join(', ')}`,
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
      error: 'inFridge must be a boolean',
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
      error: 'Target price must be a non-negative number',
    };
  }

  return { valid: true };
}

export async function listPositions(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const walletId = req.params.walletId;
    const snapshot = await positionsCollection(uid(req), walletId).get();
    const positions = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    );
    res.json(await withCurrentPrices(positions));
  } catch (error) {
    console.error('[listPositions] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createPosition(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const walletId = req.params.walletId;
    const body = req.body as Partial<Position>;

    const validation = validatePositionBody(body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
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

    const docRef = await positionsCollection(uid(req), walletId).add(
      positionData,
    );
    res.status(201).json({ id: docRef.id, ...positionData });
  } catch (error) {
    console.error('[createPosition] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPosition(req: Request, res: Response): Promise<void> {
  try {
    const { walletId, id } = req.params;
    const doc = await positionsCollection(uid(req), walletId).doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    const position = { id: doc.id, ...doc.data() } as Position;
    const [withPrice] = await withCurrentPrices([position]);
    res.json(withPrice);
  } catch (error) {
    console.error('[getPosition] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      positionId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updatePosition(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { walletId, id } = req.params;
    const positionRef = positionsCollection(uid(req), walletId).doc(id);
    const doc = await positionRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Position not found' });
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
  } catch (error) {
    console.error('[updatePosition] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      positionId: req.params.id,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deletePosition(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { walletId, id } = req.params;
    const positionRef = positionsCollection(uid(req), walletId).doc(id);
    const doc = await positionRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    await positionRef.delete();
    res.status(204).send();
  } catch (error) {
    console.error('[deletePosition] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      positionId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function moveToFridge(req: Request, res: Response): Promise<void> {
  try {
    const userId = uid(req);
    const { walletId, id: positionId } = req.params;
    const { fridgeId, targetPrice } = req.body as {
      fridgeId?: string;
      targetPrice?: number;
    };

    // Validação dos campos obrigatórios
    if (!fridgeId || typeof fridgeId !== 'string') {
      res.status(400).json({ error: 'fridgeId is required' });
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
        error: 'targetPrice is required and must be a non-negative number',
      });
      return;
    }

    // Verifica se a posição existe
    const positionRef = positionsCollection(userId, walletId).doc(positionId);
    const positionDoc = await positionRef.get();

    if (!positionDoc.exists) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    const positionData = positionDoc.data() as Position;

    // Verifica se a geladeira existe
    const fridgeRef = admin
      .firestore()
      .collection('users')
      .doc(userId)
      .collection('fridges')
      .doc(fridgeId);
    const fridgeDoc = await fridgeRef.get();

    if (!fridgeDoc.exists) {
      res.status(404).json({ error: 'Fridge not found' });
      return;
    }

    const now = new Date().toISOString();
    const fridgeItemRef = fridgeRef.collection('fridgeItems').doc();

    const fridgeItemData: Omit<FridgeItem, 'id'> = {
      fridgeId,
      ticker: positionData.ticker,
      quantity: positionData.quantity,
      transferredPrice: positionData.averagePrice,
      targetPrice,
      assetType: positionData.assetType,
      createdAt: now,
      updatedAt: now,
    };

    // currentPrice não é mais carregado da posição: passa a ser resolvido
    // a partir da collection `quotes` no momento da leitura (issue #86).

    // Operação atômica: remove posição e cria item na geladeira
    const batch = admin.firestore().batch();
    batch.delete(positionRef);
    batch.set(fridgeItemRef, fridgeItemData);
    await batch.commit();

    res.status(201).json({ id: fridgeItemRef.id, ...fridgeItemData });
  } catch (error) {
    console.error('[moveToFridge] error:', {
      uid: uid(req),
      walletId: req.params.walletId,
      positionId: req.params.id,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
