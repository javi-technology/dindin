import * as admin from 'firebase-admin';
import { Asset, AssetType } from 'dindin-models';

function assetsCollection() {
  return admin.firestore().collection('assets');
}

const VALID_ASSET_TYPES: Set<AssetType> = new Set([
  'FII',
  'STOCK',
  'ETF',
  'REIT',
  'OTHER',
]);

function normalizeAssetType(value: unknown): AssetType {
  return typeof value === 'string' && VALID_ASSET_TYPES.has(value as AssetType)
    ? (value as AssetType)
    : 'OTHER';
}

/**
 * Verifica se um ticker existe no catálogo de ativos e está ativo.
 * Usado para validar o cadastro de posições/itens da geladeira sem
 * permitir tickers arbitrários digitados pelo usuário.
 */
export async function assetExists(ticker: string): Promise<boolean> {
  const doc = await assetsCollection().doc(ticker).get();
  if (!doc.exists) return false;
  const data = doc.data() as Partial<Asset> | undefined;
  return data?.active === true;
}

export interface ActiveAsset {
  ticker: string;
  assetType: AssetType;
}

/** Lista os tickers e tipos de todos os ativos ativos do catálogo. */
export async function listActiveAssetTickers(): Promise<ActiveAsset[]> {
  const snapshot = await assetsCollection().where('active', '==', true).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Partial<Asset> | undefined;
    // Usa doc.id como fallback caso o campo `ticker` esteja ausente no
    // documento — o id do documento é sempre o próprio ticker.
    return {
      ticker: (data?.ticker ?? doc.id).toUpperCase(),
      assetType: normalizeAssetType(data?.assetType),
    };
  });
}
