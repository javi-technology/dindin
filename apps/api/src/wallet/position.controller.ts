import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Position, AssetType } from 'dindin-models';
import { AuthRequest } from '../middleware/auth.middleware';

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

function validatePositionBody(
  body: Partial<Position>,
  allowPartial = false,
): { valid: false; error: string } | { valid: true } {
  const { ticker, quantity, averagePrice, assetType, currentPrice } = body;

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

  if (
    currentPrice !== undefined &&
    (typeof currentPrice !== 'number' ||
      currentPrice < 0 ||
      !Number.isFinite(currentPrice))
  ) {
    return {
      valid: false,
      error: 'Current price must be a non-negative number',
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
    const positions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(positions);
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

    const now = new Date().toISOString();
    const positionData: Omit<Position, 'id'> = {
      walletId,
      ticker: body.ticker!.trim().toUpperCase(),
      assetType: body.assetType!,
      quantity: body.quantity!,
      averagePrice: body.averagePrice!,
      createdAt: now,
      updatedAt: now,
    };

    if (body.currentPrice !== undefined) {
      positionData.currentPrice = body.currentPrice;
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

    res.json({ id: doc.id, ...doc.data() });
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

    const updates: Partial<Position> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (body.ticker !== undefined)
      updates.ticker = body.ticker.trim().toUpperCase();
    if (body.assetType !== undefined) updates.assetType = body.assetType;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.averagePrice !== undefined)
      updates.averagePrice = body.averagePrice;
    if (body.currentPrice !== undefined)
      updates.currentPrice = body.currentPrice;

    await positionRef.update(updates);

    const updatedPosition = { id, ...doc.data(), ...updates };
    res.json(updatedPosition);
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
