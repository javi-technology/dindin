import { Request, Response } from 'express';
import type { Asset, AssetType } from 'dindin-models';
import { ASSET_TYPES, isAssetType } from './asset-type';
import { asyncHandler } from '../middleware/async-handler';
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

interface AssetBodyValid {
  valid: true;
  data: {
    ticker?: string;
    name?: string;
    assetType?: AssetType;
    active?: boolean;
    qualifiedInvestor?: boolean;
  };
}

interface AssetBodyInvalid {
  valid: false;
  errors: string[];
}

type AssetBodyValidation = AssetBodyValid | AssetBodyInvalid;

function validateAssetBody(
  body: Record<string, unknown>,
  requireIdentity = true,
): AssetBodyValidation {
  const errors: string[] = [];
  const { ticker, name, assetType, active, qualifiedInvestor } = body ?? {};

  if (
    (requireIdentity || ticker !== undefined) &&
    (!ticker || typeof ticker !== 'string' || !ticker.trim())
  ) {
    errors.push('ticker é obrigatório');
  } else if (ticker !== undefined && !/^[A-Za-z0-9]+$/.test(ticker.trim())) {
    errors.push('ticker deve conter apenas letras e números');
  }
  if (
    (requireIdentity || name !== undefined) &&
    (!name || typeof name !== 'string' || !name.trim())
  ) {
    errors.push('name é obrigatório');
  }
  if ((requireIdentity || assetType !== undefined) && !isAssetType(assetType)) {
    errors.push(`assetType deve ser um de: ${ASSET_TYPES.join(', ')}`);
  }
  if (active !== undefined && typeof active !== 'boolean') {
    errors.push('active deve ser booleano');
  }
  if (
    qualifiedInvestor !== undefined &&
    typeof qualifiedInvestor !== 'boolean'
  ) {
    errors.push('qualifiedInvestor deve ser booleano');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      ...(ticker === undefined ? {} : { ticker: ticker as string }),
      ...(name === undefined ? {} : { name: name as string }),
      ...(assetType === undefined ? {} : { assetType: assetType as AssetType }),
      active: active as boolean | undefined,
      qualifiedInvestor: qualifiedInvestor as boolean | undefined,
    },
  };
}

/**
 * Cria um novo ativo no catálogo. Requer usuário autenticado com
 * custom claim `admin: true`. O ticker é normalizado para uppercase e
 * usado como id do documento.
 */
export const createAsset = asyncHandler(
  'createAsset',
  async (req: Request, res: Response) => {
    const validation = validateAssetBody(req.body ?? {});
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join('; ') });
      return;
    }

    const { ticker, name, assetType, active, qualifiedInvestor } =
      validation.data;

    const normalizedTicker = ticker!.trim().toUpperCase();
    const docRef = assetsCollection().doc(normalizedTicker);
    const existing = await docRef.get();

    if (existing.exists) {
      res.status(409).json({ error: 'Ativo já cadastrado' });
      return;
    }

    const now = new Date().toISOString();
    const asset: Asset = {
      ticker: normalizedTicker,
      name: name!.trim(),
      assetType: assetType!,
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

    const validation = validateAssetBody(req.body ?? {}, false);
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join('; ') });
      return;
    }

    const now = new Date().toISOString();
    const patch: Partial<Asset> = {
      updatedAt: now,
    };
    if (validation.data.name !== undefined) {
      patch.name = validation.data.name.trim();
    }
    if (validation.data.assetType !== undefined) {
      patch.assetType = validation.data.assetType;
    }
    if (validation.data.active !== undefined) {
      patch.active = validation.data.active;
    }
    if (validation.data.qualifiedInvestor !== undefined) {
      patch.qualifiedInvestor = validation.data.qualifiedInvestor;
    }

    await docRef.update(patch);
    const updated = await docRef.get();
    res.json(updated.data());
  },
);
