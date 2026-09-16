import { Request, Response } from 'express';
import { Wallet } from 'dindin-models';
import { asyncHandler } from '../middleware/async-handler';
import { deleteDocumentCascading } from '../firestore/cascade-delete';
import { uid, walletsCollection } from '../firestore/paths';

// Códigos de moeda ISO 4217 aceitos pela aplicação.
// Ampliar conforme necessário.
const SUPPORTED_CURRENCIES = new Set([
  'BRL',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
  'ARS',
]);

/** Mensagem de erro de moeda não suportada, com a lista de aceitas. */
function unsupportedCurrencyError(currency: string): string {
  return `Currency '${currency}' is not supported. Accepted values: ${[...SUPPORTED_CURRENCIES].join(', ')}`;
}

export const listWallets = asyncHandler(
  'listWallets',
  async (req: Request, res: Response) => {
    const snapshot = await walletsCollection(uid(req)).get();
    const wallets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(wallets);
  },
);

export const createWallet = asyncHandler(
  'createWallet',
  async (req: Request, res: Response) => {
    const { name, description, currency } = req.body as Partial<Wallet>;

    if (!name || !currency) {
      res.status(400).json({ error: 'Name and currency are required' });
      return;
    }

    if (!SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({ error: unsupportedCurrencyError(currency) });
      return;
    }

    const now = new Date().toISOString();
    const walletData: Omit<Wallet, 'id'> = {
      ownerId: uid(req),
      name,
      description: description ?? '',
      currency,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await walletsCollection(uid(req)).add(walletData);
    res.status(201).json({ id: docRef.id, ...walletData });
  },
);

export const getWallet = asyncHandler(
  'getWallet',
  async (req: Request, res: Response) => {
    const doc = await walletsCollection(uid(req)).doc(req.params.id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  },
);

export const updateWallet = asyncHandler(
  'updateWallet',
  async (req: Request, res: Response) => {
    const walletId = req.params.id;
    const walletRef = walletsCollection(uid(req)).doc(walletId);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    const { name, description, currency } = req.body as Partial<
      Pick<Wallet, 'name' | 'description' | 'currency'>
    >;

    if (currency !== undefined && !SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({ error: unsupportedCurrencyError(currency) });
      return;
    }

    const updates: Partial<Wallet> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (currency !== undefined) updates.currency = currency;

    await walletRef.update(updates);

    // Mescla em memória para evitar segunda leitura no Firestore
    res.json({ id: walletId, ...doc.data(), ...updates });
  },
);

export const deleteWallet = asyncHandler(
  'deleteWallet',
  async (req: Request, res: Response) => {
    const walletRef = walletsCollection(uid(req)).doc(req.params.id);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    // Remove as posições em cascata antes da carteira: o Firestore não apaga
    // documentos filhos automaticamente, e posições órfãs ficariam inacessíveis
    // pela API, que só as alcança a partir da carteira (issue #219).
    await deleteDocumentCascading(walletRef, ['positions']);
    res.status(204).send();
  },
);
