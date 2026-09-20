import { getFirestore } from 'firebase-admin/firestore';
import type { Asset, AssetType } from 'dindin-models';
import { isAssetType } from './asset-type';

function assetsCollection() {
  return getFirestore().collection('assets');
}

function normalizeAssetType(value: unknown): AssetType {
  return isAssetType(value) ? value : 'OTHER';
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

export async function listQualifiedInvestorTickers(): Promise<Set<string>> {
  const snapshot = await assetsCollection()
    .where('qualifiedInvestor', '==', true)
    .get();

  return new Set(
    snapshot.docs.map((doc) => {
      const data = doc.data() as Partial<Asset> | undefined;
      return (data?.ticker ?? doc.id).toUpperCase();
    }),
  );
}
