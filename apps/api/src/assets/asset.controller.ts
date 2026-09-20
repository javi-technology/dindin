import { Request, Response } from 'express';
import type { Asset } from 'dindin-models';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler';
import {
  MAX_TICKER_LENGTH,
  assetTypeField,
  nameField,
  parseBodyAll,
} from '../shared/validation';
import { assetsCollection } from '../firestore/paths';

/**
 * Lista os ativos disponíveis no catálogo para seleção em posições/itens
 * da geladeira. Apenas ativos com `active: true` são retornados.
 */
export const listAssets = asyncHandler(
  'listAssets',
  async (req: Request, res: Response) => {
    const snapshot = await assetsCollection().where('active', '==', true).get();
    const assets = snapshot.docs.map((doc) => doc.data());
    res.json(assets);
  },
);

export const listAllAssets = asyncHandler(
  'listAllAssets',
  async (req: Request, res: Response) => {
    const snapshot = await assetsCollection().get();
    const assets = snapshot.docs
      .map((doc) => doc.data() as Asset)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
    res.json(assets);
  },
);

const assetSchema = z.object({
  ticker: z
    .string({ error: 'ticker é obrigatório' })
    .trim()
    .min(1, { error: 'ticker é obrigatório' })
    .max(MAX_TICKER_LENGTH, {
      error: `ticker deve ter no máximo ${MAX_TICKER_LENGTH} caracteres`,
    })
    .regex(/^[A-Za-z0-9]+$/, {
      error: 'ticker deve conter apenas letras e números',
    }),
  name: nameField('name'),
  assetType: assetTypeField(),
  active: z.boolean({ error: 'active deve ser booleano' }).optional(),
  qualifiedInvestor: z
    .boolean({ error: 'qualifiedInvestor deve ser booleano' })
    .optional(),
});

const updateAssetSchema = assetSchema.partial();

/**
 * Cria um novo ativo no catálogo. Requer usuário autenticado com
 * custom claim `admin: true`. O ticker é normalizado para uppercase e
 * usado como id do documento.
 */
export const createAsset = asyncHandler(
  'createAsset',
  async (req: Request, res: Response) => {
    const parsed = parseBodyAll(assetSchema, req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.errors.join('; ') });
      return;
    }

    const { ticker, name, assetType, active, qualifiedInvestor } = parsed.data;

    const normalizedTicker = ticker.toUpperCase();
    const docRef = assetsCollection().doc(normalizedTicker);
    const existing = await docRef.get();

    if (existing.exists) {
      res.status(409).json({ error: 'Ativo já cadastrado' });
      return;
    }

    const now = new Date().toISOString();
    const asset: Asset = {
      ticker: normalizedTicker,
      name,
      assetType,
      active: active !== false,
      createdAt: now,
      updatedAt: now,
      ...(qualifiedInvestor === undefined ? {} : { qualifiedInvestor }),
    };

    await docRef.set(asset);

    res.status(201).json(asset);
  },
);

export const updateAsset = asyncHandler(
  'updateAsset',
  async (req: Request, res: Response) => {
    const normalizedTicker = req.params.ticker.trim().toUpperCase();
    const docRef = assetsCollection().doc(normalizedTicker);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({ error: 'Ativo não encontrado' });
      return;
    }

    const parsed = parseBodyAll(updateAssetSchema, req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.errors.join('; ') });
      return;
    }

    const now = new Date().toISOString();
    const patch: Partial<Asset> = {
      updatedAt: now,
    };
    if (parsed.data.name !== undefined) {
      patch.name = parsed.data.name;
    }
    if (parsed.data.assetType !== undefined) {
      patch.assetType = parsed.data.assetType;
    }
    if (parsed.data.active !== undefined) {
      patch.active = parsed.data.active;
    }
    if (parsed.data.qualifiedInvestor !== undefined) {
      patch.qualifiedInvestor = parsed.data.qualifiedInvestor;
    }

    await docRef.update(patch);
    const updated = await docRef.get();
    res.json(updated.data());
  },
);
