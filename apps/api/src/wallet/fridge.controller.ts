import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Fridge, FridgeItem } from 'dindin-models';
import { AuthRequest } from '../middleware/auth.middleware';
import { assetExists } from '../assets/asset.service';
import { getQuotePrice } from '../quotes/quote-history.service';

function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

function fridgesCollection(userId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('fridges');
}

function itemsCollection(userId: string, fridgeId: string) {
  return fridgesCollection(userId).doc(fridgeId).collection('fridgeItems');
}

/**
 * Resolve o `currentPrice` de cada item a partir da collection `quotes`
 * no momento da leitura, em vez de depender de um valor denormalizado
 * gravado em cada item pelo job agendado (ver issue #86).
 */
async function withCurrentPrices(items: FridgeItem[]): Promise<FridgeItem[]> {
  const tickers = [...new Set(items.map((item) => item.ticker))];
  const prices = await Promise.all(
    tickers.map((ticker) => getQuotePrice(ticker)),
  );
  const priceByTicker = new Map(
    tickers.map((ticker, i) => [ticker, prices[i]]),
  );

  return items.map((item) => {
    const price = priceByTicker.get(item.ticker);
    return price !== undefined ? { ...item, currentPrice: price } : item;
  });
}

/* ---------- Fridge CRUD ---------- */

export async function listFridges(req: Request, res: Response): Promise<void> {
  try {
    const userId = uid(req);
    const snapshot = await fridgesCollection(userId).get();
    const fridges = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(fridges);
  } catch (error) {
    console.error('[listFridges] error:', {
      uid: uid(req),
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createFridge(req: Request, res: Response): Promise<void> {
  try {
    const { name, description } = req.body as Partial<Fridge>;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const now = new Date().toISOString();
    const fridgeData: Omit<Fridge, 'id'> = {
      ownerId: uid(req),
      name,
      description: description ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await fridgesCollection(uid(req)).add(fridgeData);
    res.status(201).json({ id: docRef.id, ...fridgeData });
  } catch (error) {
    console.error('[createFridge] error:', {
      uid: uid(req),
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getFridge(req: Request, res: Response): Promise<void> {
  try {
    const fridgeId = req.params.id;
    const doc = await fridgesCollection(uid(req)).doc(fridgeId).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Fridge not found' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('[getFridge] error:', {
      uid: uid(req),
      fridgeId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateFridge(req: Request, res: Response): Promise<void> {
  try {
    const fridgeId = req.params.id;
    const fridgeRef = fridgesCollection(uid(req)).doc(fridgeId);
    const doc = await fridgeRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Fridge not found' });
      return;
    }

    const { name, description } = req.body as Partial<
      Pick<Fridge, 'name' | 'description'>
    >;

    const updatedAt = new Date().toISOString();
    const updates: Partial<Fridge> & { updatedAt: string } = { updatedAt };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    await fridgeRef.update(updates);

    const updatedDoc = await fridgeRef.get();
    res.json({ id: fridgeId, ...updatedDoc.data() });
  } catch (error) {
    console.error('[updateFridge] error:', {
      uid: uid(req),
      fridgeId: req.params.id,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteFridge(req: Request, res: Response): Promise<void> {
  try {
    const fridgeId = req.params.id;
    const fridgeRef = fridgesCollection(uid(req)).doc(fridgeId);
    const doc = await fridgeRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Fridge not found' });
      return;
    }

    // Remove os itens da geladeira em cascata antes de deletar a geladeira.
    // O Firestore não cascadeia deletes automaticamente.
    const itemsSnapshot = await fridgeRef.collection('fridgeItems').get();
    const batch = admin.firestore().batch();
    itemsSnapshot.docs.forEach((itemDoc) => batch.delete(itemDoc.ref));
    batch.delete(fridgeRef);
    await batch.commit();

    res.status(204).send();
  } catch (error) {
    console.error('[deleteFridge] error:', {
      uid: uid(req),
      fridgeId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/* ---------- FridgeItem CRUD ---------- */

/** Verifica se a geladeira existe e pertence ao usuário. Retorna true se válida. */
async function validateFridgeExists(
  userId: string,
  fridgeId: string,
  res: Response,
): Promise<boolean> {
  const fridgeDoc = await fridgesCollection(userId).doc(fridgeId).get();
  if (!fridgeDoc.exists) {
    res.status(404).json({ error: 'Fridge not found' });
    return false;
  }
  return true;
}

function validateItemBody(
  body: Partial<FridgeItem>,
  allowPartial = false,
): { valid: false; error: string } | { valid: true } {
  const { ticker, quantity, transferredPrice, targetPrice, currentPrice } =
    body;

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

  if (!allowPartial || transferredPrice !== undefined) {
    if (
      typeof transferredPrice !== 'number' ||
      transferredPrice < 0 ||
      !Number.isFinite(transferredPrice)
    ) {
      return {
        valid: false,
        error:
          'Transferred price is required and must be a non-negative number',
      };
    }
  }

  if (!allowPartial || targetPrice !== undefined) {
    if (
      typeof targetPrice !== 'number' ||
      targetPrice < 0 ||
      !Number.isFinite(targetPrice)
    ) {
      return {
        valid: false,
        error: 'Target price is required and must be a non-negative number',
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

export async function listItems(req: Request, res: Response): Promise<void> {
  try {
    const { fridgeId } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const snapshot = await itemsCollection(userId, fridgeId).get();
    const items = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as FridgeItem,
    );
    res.json(await withCurrentPrices(items));
  } catch (error) {
    console.error('[listItems] error:', {
      uid: uid(req),
      fridgeId: req.params.fridgeId,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createItem(req: Request, res: Response): Promise<void> {
  try {
    const { fridgeId } = req.params;
    const userId = uid(req);
    const body = req.body as Partial<FridgeItem>;

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const validation = validateItemBody(body);
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
    const itemData: Omit<FridgeItem, 'id'> = {
      fridgeId,
      ticker,
      quantity: body.quantity!,
      transferredPrice: body.transferredPrice!,
      targetPrice: body.targetPrice!,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await itemsCollection(userId, fridgeId).add(itemData);
    res.status(201).json({ id: docRef.id, ...itemData });
  } catch (error) {
    console.error('[createItem] error:', {
      uid: uid(req),
      fridgeId: req.params.fridgeId,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getItem(req: Request, res: Response): Promise<void> {
  try {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const doc = await itemsCollection(userId, fridgeId).doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const item = { id: doc.id, ...doc.data() } as FridgeItem;
    const [withPrice] = await withCurrentPrices([item]);
    res.json(withPrice);
  } catch (error) {
    console.error('[getItem] error:', {
      uid: uid(req),
      fridgeId: req.params.fridgeId,
      itemId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  try {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const itemRef = itemsCollection(userId, fridgeId).doc(id);
    const doc = await itemRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const body = req.body as Partial<FridgeItem>;

    const validation = validateItemBody(body, true);
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

    const updatedAt = new Date().toISOString();
    const updates: Partial<FridgeItem> & { updatedAt: string } = { updatedAt };

    // currentPrice não é mais aceito na atualização: o preço é resolvido
    // a partir da collection `quotes` no momento da leitura (issue #86).
    if (ticker !== undefined) updates.ticker = ticker;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.transferredPrice !== undefined)
      updates.transferredPrice = body.transferredPrice;
    if (body.targetPrice !== undefined) updates.targetPrice = body.targetPrice;

    await itemRef.update(updates);

    const updatedDoc = await itemRef.get();
    res.json({ id, ...updatedDoc.data() });
  } catch (error) {
    console.error('[updateItem] error:', {
      uid: uid(req),
      fridgeId: req.params.fridgeId,
      itemId: req.params.id,
      body: req.body,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  try {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const itemRef = itemsCollection(userId, fridgeId).doc(id);
    const doc = await itemRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    await itemRef.delete();
    res.status(204).send();
  } catch (error) {
    console.error('[deleteItem] error:', {
      uid: uid(req),
      fridgeId: req.params.fridgeId,
      itemId: req.params.id,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
