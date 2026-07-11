import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Wallet } from 'dindin-models';
import { AuthRequest } from '../middleware/auth.middleware';

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

function walletsCollection(userId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('wallets');
}

/** Retorna o uid do usuário autenticado. O authMiddleware garante que sempre está presente. */
function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

export async function listWallets(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await walletsCollection(uid(req)).get();
    const wallets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(wallets);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createWallet(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, currency } = req.body as Partial<Wallet>;

    if (!name || !currency) {
      res.status(400).json({ error: 'Name and currency are required' });
      return;
    }

    if (!SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({
        error: `Currency '${currency}' is not supported. Accepted values: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      });
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
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWallet(req: Request, res: Response): Promise<void> {
  try {
    const walletId = req.params.id;
    const doc = await walletsCollection(uid(req)).doc(walletId).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateWallet(req: Request, res: Response): Promise<void> {
  try {
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
      res.status(400).json({
        error: `Currency '${currency}' is not supported. Accepted values: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    const updates: Partial<Wallet> & { updatedAt: string } = { updatedAt };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (currency !== undefined) updates.currency = currency;

    await walletRef.update(updates);

    // Mescla em memória para evitar segunda leitura no Firestore
    const updatedWallet = { id: walletId, ...doc.data(), ...updates };
    res.json(updatedWallet);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteWallet(req: Request, res: Response): Promise<void> {
  try {
    const walletId = req.params.id;
    const walletRef = walletsCollection(uid(req)).doc(walletId);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    // TODO(#10): remover sub-coleção positions/{positionId} antes de deletar a carteira.
    // O Firestore não apaga documentos filhos automaticamente; use batch delete ou
    // uma Cloud Function acionada por onDelete para evitar dados órfãos.
    await walletRef.delete();
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}
