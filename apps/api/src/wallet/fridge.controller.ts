import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { Fridge, FridgeItem, Position } from 'dindin-models';
import { assetExists } from '../assets/asset.service';
import { getQuotePricesByTicker } from '../quotes/quote-prices';
import { deleteDocumentCascading } from '../firestore/cascade-delete';
import { asyncHandler } from '../middleware/async-handler';
import { HttpError } from '../shared/http-error';
import {
  uid,
  fridgesCollection,
  fridgeItemsCollection,
  positionsCollection,
  walletsCollection,
} from '../firestore/paths';

/**
 * Resolve o `currentPrice` de cada item a partir da collection `quotes`
 * no momento da leitura, em vez de depender de um valor denormalizado
 * gravado em cada item pelo job agendado (ver issue #86).
 */
async function withCurrentPrices(items: FridgeItem[]): Promise<FridgeItem[]> {
  const priceByTicker = await getQuotePricesByTicker(
    items.map((item) => item.ticker),
  );

  // Sempre sobrescreve currentPrice com o valor resolvido de `quotes` (ou
  // undefined, removido do JSON de resposta), mesmo que o documento ainda
  // tenha um valor antigo denormalizado no Firestore.
  return items.map((item) => ({
    ...item,
    currentPrice: priceByTicker.get(item.ticker),
  }));
}

/* ---------- Fridge CRUD ---------- */

export const listFridges = asyncHandler(
  'listFridges',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const snapshot = await fridgesCollection(userId).get();
    const fridges = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(fridges);
  },
);

export const createFridge = asyncHandler(
  'createFridge',
  async (req: Request, res: Response) => {
    const { name, description } = req.body as Partial<Fridge>;

    if (!name) {
      res.status(400).json({ error: 'Nome é obrigatório' });
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
  },
);

export const getFridge = asyncHandler(
  'getFridge',
  async (req: Request, res: Response) => {
    const fridgeId = req.params.id;
    const doc = await fridgesCollection(uid(req)).doc(fridgeId).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Geladeira não encontrada' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  },
);

export const updateFridge = asyncHandler(
  'updateFridge',
  async (req: Request, res: Response) => {
    const fridgeId = req.params.id;
    const fridgeRef = fridgesCollection(uid(req)).doc(fridgeId);
    const doc = await fridgeRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Geladeira não encontrada' });
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
  },
);

export const deleteFridge = asyncHandler(
  'deleteFridge',
  async (req: Request, res: Response) => {
    const fridgeId = req.params.id;
    const fridgeRef = fridgesCollection(uid(req)).doc(fridgeId);
    const doc = await fridgeRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Geladeira não encontrada' });
      return;
    }

    // Remove os itens da geladeira em cascata antes de deletar a geladeira.
    // O Firestore não cascadeia deletes automaticamente. A exclusão vai em
    // lotes de 500 porque é o limite de operações de um batch: a versão
    // anterior punha todos os itens num único batch, então uma geladeira com
    // mais de 500 itens falhava no commit e não era excluída (issue #219).
    await deleteDocumentCascading(fridgeRef, ['fridgeItems']);

    res.status(204).send();
  },
);

/* ---------- FridgeItem CRUD ---------- */

/** Verifica se a geladeira existe e pertence ao usuário. Retorna true se válida. */
async function validateFridgeExists(
  userId: string,
  fridgeId: string,
  res: Response,
): Promise<boolean> {
  const fridgeDoc = await fridgesCollection(userId).doc(fridgeId).get();
  if (!fridgeDoc.exists) {
    res.status(404).json({ error: 'Geladeira não encontrada' });
    return false;
  }
  return true;
}

function validateItemBody(
  body: Partial<FridgeItem>,
  allowPartial = false,
): { valid: false; error: string } | { valid: true } {
  const { ticker, quantity, transferredPrice, targetPrice } = body;

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
        error: 'Preço-alvo é obrigatório e deve ser um número não negativo',
      };
    }
  }

  // currentPrice não é mais aceito no cadastro/atualização de itens: é
  // resolvido a partir de `quotes/{ticker}` na leitura (issue #86). Um
  // valor enviado pelo cliente é silenciosamente ignorado por
  // createItem/updateItem, então não é validado aqui.

  return { valid: true };
}

export const listItems = asyncHandler(
  'listItems',
  async (req: Request, res: Response) => {
    const { fridgeId } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const snapshot = await fridgeItemsCollection(userId, fridgeId).get();
    const items = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as FridgeItem,
    );
    res.json(await withCurrentPrices(items));
  },
);

export const createItem = asyncHandler(
  'createItem',
  async (req: Request, res: Response) => {
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

    const docRef = await fridgeItemsCollection(userId, fridgeId).add(itemData);
    res.status(201).json({ id: docRef.id, ...itemData });
  },
);

export const getItem = asyncHandler(
  'getItem',
  async (req: Request, res: Response) => {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const doc = await fridgeItemsCollection(userId, fridgeId).doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item não encontrado' });
      return;
    }

    const item = { id: doc.id, ...doc.data() } as FridgeItem;
    const [withPrice] = await withCurrentPrices([item]);
    res.json(withPrice);
  },
);

export const updateItem = asyncHandler(
  'updateItem',
  async (req: Request, res: Response) => {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const itemRef = fridgeItemsCollection(userId, fridgeId).doc(id);
    const doc = await itemRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item não encontrado' });
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
    const item = { id, ...updatedDoc.data() } as FridgeItem;
    const [withPrice] = await withCurrentPrices([item]);
    res.json(withPrice);
  },
);

export const deleteItem = asyncHandler(
  'deleteItem',
  async (req: Request, res: Response) => {
    const { fridgeId, id } = req.params;
    const userId = uid(req);

    if (!(await validateFridgeExists(userId, fridgeId, res))) return;

    const itemRef = fridgeItemsCollection(userId, fridgeId).doc(id);
    const doc = await itemRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Item não encontrado' });
      return;
    }

    await itemRef.delete();
    res.status(204).send();
  },
);

export const unfreezeItem = asyncHandler(
  'unfreezeItem',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const { fridgeId, id } = req.params;
    const { walletId } = req.body as { walletId?: unknown };

    if (!walletId || typeof walletId !== 'string') {
      res.status(400).json({ error: 'walletId é obrigatório' });
      return;
    }

    const itemRef = fridgeItemsCollection(userId, fridgeId).doc(id);
    const walletRef = walletsCollection(userId).doc(walletId);
    const positionRef = positionsCollection(userId, walletId).doc();

    // O item é lido dentro da transação, não antes dela: `delete` de um
    // documento que já sumiu não falha, então com a leitura fora duas
    // chamadas simultâneas passavam pela checagem de existência e cada uma
    // criava uma posição, duplicando a quantidade na carteira (issue #295).
    const positionData = await getFirestore().runTransaction(
      async (transaction) => {
        const [itemDoc, walletDoc] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(walletRef),
        ]);

        if (!itemDoc.exists)
          throw HttpError.notFound('Item da geladeira não encontrado');
        if (!walletDoc.exists)
          throw HttpError.notFound('Carteira não encontrada');

        const item = itemDoc.data() as FridgeItem;
        const now = new Date().toISOString();
        const data: Omit<Position, 'id'> = {
          walletId,
          ticker: item.ticker,
          assetType: item.assetType ?? 'FII',
          quantity: item.quantity,
          averagePrice: item.transferredPrice,
          inFridge: false,
          createdAt: now,
          updatedAt: now,
        };

        transaction.delete(itemRef);
        transaction.set(positionRef, data);

        return data;
      },
    );

    res.status(201).json({ id: positionRef.id, ...positionData });
  },
);
