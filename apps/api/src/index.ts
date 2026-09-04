import * as functions from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import express, { Request, Response, NextFunction } from 'express';
import {
  authMiddleware,
  adminAuthMiddleware,
  AuthRequest,
} from './middleware/auth.middleware';
import {
  createWallet,
  deleteWallet,
  getWallet,
  listWallets,
  updateWallet,
} from './wallet/wallet.controller';
import {
  createPosition,
  deletePosition,
  getPosition,
  listPositions,
  moveToFridge,
  updatePosition,
} from './wallet/position.controller';
import {
  createFridge,
  deleteFridge,
  getFridge,
  listFridges,
  updateFridge,
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
  unfreezeItem,
} from './wallet/fridge.controller';
import {
  createDividend,
  deleteDividend,
  getDividend,
  getDividendProjection,
  getDividendYield,
  getMonthlyDividendReport,
  getMonthlyIncome,
  listDividends,
  postMonthlyDividendRecord,
  updateDividend,
} from './dividend/dividend.controller';
import { updateAllQuotes } from './quotes/update-quotes.handler';
import { createAsset, listAssets } from './assets/asset.controller';
import {
  getPatrimonyHistory,
  postPatrimonySnapshot,
} from './patrimony/patrimony.controller';
import { saveAllPatrimonySnapshots } from './patrimony/patrimony-snapshot.service';
import { recordAllMonthlyDividends } from './dividend/dividend-record.service';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import {
  compareRecommended,
  confirmRecommended,
  getLatestRecommended,
  importRecommended,
  listRecommended,
} from './recommended-wallet/recommended-wallet.controller';
import {
  BB_WALLET_PREFIX,
  downloadBbPdf,
} from './recommended-wallet/storage.service';
import {
  importBbWallet,
  syncBbWallet,
} from './recommended-wallet/recommended-wallet.service';

admin.initializeApp();

const app = express();
app.use(express.json({ limit: '10mb' }));

// Middleware de log de requisições para diagnóstico em produção
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;

  // Captura o fim da resposta para logar status e duração
  const originalJson = _res.json.bind(_res);
  _res.json = function (body: unknown) {
    const duration = Date.now() - start;
    console.log(`[${method}] ${path} → ${_res.statusCode} (${duration}ms)`);
    return originalJson(body);
  };

  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', project: 'dindin' });
});

app.use('/api/*', authMiddleware);

app.get('/api/me', (req: AuthRequest, res: Response) => {
  res.json({ uid: req.user?.uid, admin: req.user?.admin });
});

app.get('/api/assets', listAssets);
app.post('/api/admin/assets', adminAuthMiddleware, createAsset);

app.get('/api/wallets', listWallets);
app.post('/api/wallets', createWallet);
app.get('/api/wallets/:id', getWallet);
app.put('/api/wallets/:id', updateWallet);
app.delete('/api/wallets/:id', deleteWallet);

app.get('/api/wallets/:walletId/dividend-yield', getDividendYield);
app.get('/api/wallets/:walletId/monthly-income', getMonthlyIncome);
app.get('/api/wallets/:walletId/positions', listPositions);
app.post('/api/wallets/:walletId/positions', createPosition);
app.get('/api/wallets/:walletId/positions/:id', getPosition);
app.put('/api/wallets/:walletId/positions/:id', updatePosition);
app.delete('/api/wallets/:walletId/positions/:id', deletePosition);
app.post('/api/wallets/:walletId/positions/:id/move-to-fridge', moveToFridge);

app.get('/api/fridges', listFridges);
app.post('/api/fridges', createFridge);
app.get('/api/fridges/:id', getFridge);
app.put('/api/fridges/:id', updateFridge);
app.delete('/api/fridges/:id', deleteFridge);

app.get('/api/fridges/:fridgeId/items', listItems);
app.post('/api/fridges/:fridgeId/items', createItem);
app.get('/api/fridges/:fridgeId/items/:id', getItem);
app.put('/api/fridges/:fridgeId/items/:id', updateItem);
app.delete('/api/fridges/:fridgeId/items/:id', deleteItem);
app.post('/api/fridges/:fridgeId/items/:id/unfreeze', unfreezeItem);

app.get('/api/dividends', listDividends);
app.get('/api/dividends/projection', getDividendProjection);
app.get('/api/dividends/monthly-report', getMonthlyDividendReport);
app.post('/api/dividends/record-monthly', postMonthlyDividendRecord);
app.post('/api/dividends', createDividend);
app.get('/api/dividends/:id', getDividend);
app.put('/api/dividends/:id', updateDividend);
app.delete('/api/dividends/:id', deleteDividend);

app.get('/api/patrimony/history', getPatrimonyHistory);
app.post('/api/patrimony/snapshots', postPatrimonySnapshot);

app.get('/api/recommended-wallets/bb-fii', listRecommended);
app.get('/api/recommended-wallets/bb-fii/latest', getLatestRecommended);
app.get(
  '/api/recommended-wallets/bb-fii/compare/:walletId',
  compareRecommended,
);
app.post(
  '/api/admin/recommended-wallets/bb-fii/import',
  adminAuthMiddleware,
  importRecommended,
);
app.put(
  '/api/admin/recommended-wallets/bb-fii/:id/confirm',
  adminAuthMiddleware,
  confirmRecommended,
);

// Middleware global de tratamento de erros não capturados
app.use(
  (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    console.error('[unhandledError]', {
      method: req.method,
      path: req.path,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  },
);

export const api = functions.https.onRequest(app);

// Cloud Function agendada para atualizar cotações 1x ao dia.
// Ver issues #10 e #22 — busca cotações via Brapi (fallback Yahoo Finance)
// e salva em `quotes/{ticker}` + histórico.
// O segredo BRAPI_API_KEY é vinculado via `secrets` para ficar disponível
// em process.env dentro da execução. Configurar com:
//   firebase functions:secrets:set BRAPI_API_KEY
export const updateQuotesScheduled = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
    secrets: ['BRAPI_API_KEY'],
  },
  async () => {
    await updateAllQuotes();
  },
);

// Snapshot diário do patrimônio, 1h após a atualização de cotações
export const savePatrimonySnapshotsScheduled = onSchedule(
  {
    schedule: '0 1 * * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
  },
  async () => {
    await saveAllPatrimonySnapshots();
  },
);

// Registro mensal de proventos no primeiro dia do mês, após atualizar cotações.
export const recordMonthlyDividendsScheduled = onSchedule(
  {
    schedule: '0 2 1 * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
  },
  async () => {
    await recordAllMonthlyDividends();
  },
);

export const syncBbWalletScheduled = onSchedule(
  {
    schedule: '0 3 1-10 * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  syncBbWallet,
);

export const onBbWalletPdfUploaded = onObjectFinalized(
  {
    bucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? 'dindin-4e720.firebasestorage.app',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const name = event.data.name;
    if (
      !name.startsWith(BB_WALLET_PREFIX) ||
      !name.toLowerCase().endsWith('.pdf')
    )
      return;
    const buffer = await downloadBbPdf(name);
    await importBbWallet(buffer, name);
  },
);

export { app };
