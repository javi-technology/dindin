import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Asset, AssetType } from 'dindin-models';

const VALID_ASSET_TYPES: AssetType[] = ['FII', 'STOCK', 'ETF', 'REIT', 'OTHER'];

function assetsCollection() {
  return admin.firestore().collection('assets');
}

/**
 * Lista os ativos disponíveis no catálogo para seleção em posições/itens
 * da geladeira. Apenas ativos com `active: true` são retornados.
 */
export async function listAssets(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await assetsCollection().where('active', '==', true).get();
    const assets = snapshot.docs.map((doc) => doc.data());
    res.json(assets);
  } catch (error) {
    console.error('[listAssets] error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

interface AssetBodyValid {
  valid: true;
  data: {
    ticker: string;
    name: string;
    assetType: AssetType;
    active?: boolean;
  };
}

interface AssetBodyInvalid {
  valid: false;
  errors: string[];
}

type AssetBodyValidation = AssetBodyValid | AssetBodyInvalid;

function validateAssetBody(body: Record<string, unknown>): AssetBodyValidation {
  const errors: string[] = [];
  const { ticker, name, assetType, active } = body ?? {};

  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
    errors.push('ticker is required');
  } else if (!/^[A-Za-z0-9]+$/.test(ticker.trim())) {
    errors.push('ticker must contain only letters and numbers');
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required');
  }
  if (!assetType || !VALID_ASSET_TYPES.includes(assetType as AssetType)) {
    errors.push(`assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`);
  }
  if (active !== undefined && typeof active !== 'boolean') {
    errors.push('active must be a boolean');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      ticker: ticker as string,
      name: name as string,
      assetType: assetType as AssetType,
      active: active as boolean | undefined,
    },
  };
}

/**
 * Cria um novo ativo no catálogo. Requer usuário autenticado com
 * custom claim `admin: true`. O ticker é normalizado para uppercase e
 * usado como id do documento.
 */
export async function createAsset(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateAssetBody(req.body ?? {});
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join('; ') });
      return;
    }

    const { ticker, name, assetType, active } = validation.data;

    const normalizedTicker = ticker.trim().toUpperCase();
    const docRef = assetsCollection().doc(normalizedTicker);
    const existing = await docRef.get();

    if (existing.exists) {
      res.status(409).json({ error: 'Asset already exists' });
      return;
    }

    const now = new Date().toISOString();
    const asset: Asset = {
      ticker: normalizedTicker,
      name: name.trim(),
      assetType,
      active: active !== false,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(asset);

    res.status(201).json(asset);
  } catch (error) {
    console.error('[createAsset] error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
