/**
 * Script de seed do catálogo de ativos suportados (collection `assets`).
 *
 * Popula/atualiza o catálogo usado para:
 *  - validar o ticker no cadastro de posições/itens da geladeira;
 *  - alimentar o seletor de ativos no frontend;
 *  - informar quais tickers o job `updateQuotesScheduled` deve consultar
 *    na Brapi (ver issue #86).
 *
 * Uso (a partir da raiz do repositório):
 *   GOOGLE_APPLICATION_CREDENTIALS=<caminho-da-service-account> \
 *     npm run seed:assets --workspace=apps/api
 *
 * Ou, a partir de apps/api (o script `npm run build` gera lib/, e o
 * `node` roda com cwd = apps/api, por isso o caminho é relativo a essa
 * pasta e não à raiz do repositório):
 *   cd apps/api
 *   npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=<caminho-da-service-account> \
 *     node lib/scripts/seed-assets.js
 *
 * Requer credenciais com permissão de escrita no Firestore do projeto
 * (ex: `firebase login` + Application Default Credentials, ou uma
 * service account key via GOOGLE_APPLICATION_CREDENTIALS).
 */
import * as admin from 'firebase-admin';
import { Asset, AssetType } from 'dindin-models';

interface SeedAsset {
  ticker: string;
  name: string;
  assetType: AssetType;
}

// Catálogo inicial de FIIs populares na B3. Novos ativos podem ser
// adicionados aqui e re-aplicados executando o script novamente
// (operação idempotente — usa `set` com merge).
const SEED_ASSETS: SeedAsset[] = [
  { ticker: 'HGLG11', name: 'CSHG Logística', assetType: 'FII' },
  { ticker: 'MXRF11', name: 'Maxi Renda', assetType: 'FII' },
  { ticker: 'KNRI11', name: 'Kinea Renda Imobiliária', assetType: 'FII' },
  { ticker: 'XPML11', name: 'XP Malls', assetType: 'FII' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers', assetType: 'FII' },
  { ticker: 'BCFF11', name: 'BTG Pactual Fundo de Fundos', assetType: 'FII' },
  { ticker: 'HGRE11', name: 'CSHG Real Estate', assetType: 'FII' },
  {
    ticker: 'IRDM11',
    name: 'Iridium Recebíveis Imobiliários',
    assetType: 'FII',
  },
];

async function seedAssets(): Promise<void> {
  admin.initializeApp();
  const assetsCollection = admin.firestore().collection('assets');
  const now = new Date().toISOString();

  const batch = admin.firestore().batch();
  for (const seed of SEED_ASSETS) {
    const asset: Asset = {
      ...seed,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(assetsCollection.doc(seed.ticker), asset, { merge: true });
  }
  await batch.commit();

  console.log(
    `[seedAssets] ${SEED_ASSETS.length} ativo(s) aplicado(s) ao catálogo.`,
  );
}

seedAssets().catch((error) => {
  console.error('[seedAssets] error:', error);
  process.exitCode = 1;
});
