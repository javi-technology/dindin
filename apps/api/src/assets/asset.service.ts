import * as admin from 'firebase-admin';
import { Asset } from 'dindin-models';

function assetsCollection() {
  return admin.firestore().collection('assets');
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

/** Lista os tickers de todos os ativos ativos do catálogo. */
export async function listActiveAssetTickers(): Promise<string[]> {
  const snapshot = await assetsCollection().where('active', '==', true).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Partial<Asset> | undefined;
    // Usa doc.id como fallback caso o campo `ticker` esteja ausente no
    // documento — o id do documento é sempre o próprio ticker.
    return data?.ticker ?? doc.id;
  });
}
