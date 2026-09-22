import { Request, Response } from 'express';
import { z } from 'zod';
import { Wallet } from 'dindin-models';
import {
  currencyField,
  descriptionField,
  nameField,
  parseBody,
} from '../shared/validation';
import { asyncHandler } from '../middleware/async-handler';
import { deleteDocumentCascading } from '../firestore/cascade-delete';
import { uid, walletsCollection } from '../firestore/paths';
import { routeParam } from '../shared/route-params';

// O DinDin é BRL-only por decisão de produto (issue #266, herdada da #105):
// projeção de proventos, patrimônio e totais consolidados somam valores sem
// conversão de câmbio. Aceitar outra moeda gravaria uma carteira que todos os
// cálculos do app tratariam como se fosse em reais.
const createWalletSchema = z.object({
  name: nameField('Nome'),
  description: descriptionField(),
  currency: currencyField(),
});

const updateWalletSchema = createWalletSchema.partial();

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
    const parsed = parseBody(createWalletSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { name, description, currency } = parsed.data;
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
    const doc = await walletsCollection(uid(req))
      .doc(routeParam(req, 'id'))
      .get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Carteira não encontrada' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  },
);

export const updateWallet = asyncHandler(
  'updateWallet',
  async (req: Request, res: Response) => {
    const walletId = routeParam(req, 'id');
    const walletRef = walletsCollection(uid(req)).doc(walletId);
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Carteira não encontrada' });
      return;
    }

    const parsed = parseBody(updateWalletSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { name, description, currency } = parsed.data;
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
    const walletRef = walletsCollection(uid(req)).doc(routeParam(req, 'id'));
    const doc = await walletRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Carteira não encontrada' });
      return;
    }

    // Remove as posições em cascata antes da carteira: o Firestore não apaga
    // documentos filhos automaticamente, e posições órfãs ficariam inacessíveis
    // pela API, que só as alcança a partir da carteira (issue #219).
    await deleteDocumentCascading(walletRef, ['positions']);
    res.status(204).send();
  },
);
