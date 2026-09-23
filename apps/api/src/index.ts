import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import express, { Request, Response, NextFunction } from 'express';
import {
  authMiddleware,
  adminAuthMiddleware,
  AuthRequest,
} from './middleware/auth.middleware';
import { requireEntitlement } from './middleware/entitlement.middleware';
import {
  adminRateLimiter,
  apiRateLimiter,
} from './middleware/rate-limit.middleware';
import {
  effectiveStatus,
  getSubscription,
  listEntitlements,
  toPublicSubscription,
} from './billing/entitlement.service';
import { MeResponse } from 'dindin-shared-types';
import { logError, logInfo } from './shared/logger';
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
import { getDashboardSummary } from './dashboard/dashboard.controller';
import {
  createDividend,
  deleteDividend,
  getDividend,
  getDividendProjection,
  getDividendYield,
  getConsolidatedMonthlyIncome,
  getMonthlyDividendReport,
  getMonthlyIncome,
  listDividends,
  updateDividend,
} from './dividend/dividend.controller';
import { updateAllQuotes } from './quotes/update-quotes.handler';
import { setupDefaults } from './me/setup.controller';
import {
  getDividendHistory,
  getDividendHistoryBatch,
} from './quotes/dividend-history.controller';
import {
  createAsset,
  listAllAssets,
  listAssets,
  updateAsset,
} from './assets/asset.controller';
import {
  getPatrimonyHistory,
  postPatrimonySnapshot,
} from './patrimony/patrimony.controller';
import { saveAllPatrimonySnapshots } from './patrimony/patrimony-snapshot.service';
import { checkAllTargetPrices } from './alerts/target-price.service';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import {
  compareRecommended,
  confirmRecommended,
  getLatestRecommended,
  getSuggestion,
  generateSuggestion,
  applySuggestionItem,
  importRecommended,
  listRecommended,
} from './recommended-wallet/recommended-wallet.controller';
import {
  BB_WALLET_PREFIX,
  downloadBbPdf,
} from './recommended-wallet/storage.service';
import {
  grantSubscription,
  listUsers,
  revokeSubscription,
} from './admin/subscription/admin-subscription.controller';
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} from './billing/billing.controller';
import {
  importBbWallet,
  syncBbWallet,
} from './recommended-wallet/recommended-wallet.service';

initializeApp();

const app = express();

// A Function recebe as requisições via Firebase Hosting/Cloud Run; sem isso o
// req.ip seria o do proxy e o rate limit trataria todos como um único cliente.
app.set('trust proxy', true);

/**
 * Log de requisições para diagnóstico em produção.
 *
 * Escuta `finish` em vez de embrulhar `res.json` (issue #324): assim entram
 * também as respostas sem corpo — os 204 de toda exclusão e os 401 do
 * authMiddleware —, que são justamente as procuradas ao investigar "sumiu a
 * posição" ou "não consigo entrar".
 *
 * Fica acima de tudo, inclusive do webhook da Stripe: registrado depois, o
 * webhook casava primeiro e suas respostas ficavam fora do log — e é nele que
 * assinatura inválida e evento antigo são descartados.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;

  res.on('finish', () => {
    logInfo('request', {
      method,
      path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ...((req as AuthRequest).user?.uid
        ? { uid: (req as AuthRequest).user?.uid }
        : {}),
    });
  });

  next();
});

// Webhook da Stripe precisa do body cru (Buffer) para validar a assinatura
// e não passa pelo authMiddleware — registrar antes do express.json.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook,
);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', project: 'dindin' });
});

// Autenticação e rate limit **antes** dos parsers: ler o corpo é o passo caro
// (até 10 MB na rota de import), e quem não está autenticado não deve chegar
// a pagá-lo (issue #298). O `/api/health` fica acima, aberto.
// No Express 5 o curinga precisa de nome (`*splat`): `'/api/*'` é recusado
// pelo path-to-regexp v8 (issue #317).
app.use('/api/*splat', apiRateLimiter, authMiddleware);

// O limite pequeno vale para todas as rotas: o que trafega nelas é um punhado
// de campos. Só o import do PDF da carteira do BB, em base64, precisa de mais.
export const DEFAULT_BODY_LIMIT = '100kb';
export const PDF_IMPORT_BODY_LIMIT = '10mb';

// O parser do import vem antes do global: quem chega primeiro lê o corpo, e o
// `express.json` seguinte ignora requisição já parseada. Deixar o limite maior
// só na definição da rota não adiantaria — o global já teria recusado o corpo
// com 413 antes de o roteador chegar lá.
app.use(
  '/api/admin/recommended-wallets/bb-fii/import',
  express.json({ limit: PDF_IMPORT_BODY_LIMIT }),
);

app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));

/**
 * Corpo ausente vira objeto vazio (issue #317).
 *
 * O body-parser 2, que vem com o Express 5, deixou de fazer
 * `req.body = req.body || {}`. Sem isso, requisição sem corpo — ou com
 * Content-Type que não seja JSON — chega aos handlers com `req.body`
 * indefinido, e quem desestrutura direto lança TypeError: o cliente recebe
 * 500 no lugar do 400 da validação. Normalizar aqui vale para toda rota, em
 * vez de espalhar `?? {}` por cada handler.
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.get('/api/me', async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const isAdmin = user.admin === true;
  try {
    const subscription = await getSubscription(user.uid);
    const body: MeResponse = {
      uid: user.uid,
      admin: isAdmin,
      subscription: toPublicSubscription({
        ...subscription,
        status: effectiveStatus(subscription),
      }),
      entitlements: listEntitlements(subscription, isAdmin),
    };
    res.json(body);
  } catch (error) {
    logError('getMe', {
      uid: user.uid,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/me/setup', setupDefaults);

app.post('/api/billing/checkout-session', createCheckoutSession);
app.post('/api/billing/portal-session', createPortalSession);

app.get('/api/assets', listAssets);
app.get(
  '/api/admin/assets',
  adminAuthMiddleware,
  adminRateLimiter,
  listAllAssets,
);
app.post(
  '/api/admin/assets',
  adminAuthMiddleware,
  adminRateLimiter,
  createAsset,
);
app.put(
  '/api/admin/assets/:ticker',
  adminAuthMiddleware,
  adminRateLimiter,
  updateAsset,
);

app.get('/api/admin/users', adminAuthMiddleware, adminRateLimiter, listUsers);
app.put(
  '/api/admin/users/:uid/subscription',
  adminAuthMiddleware,
  adminRateLimiter,
  grantSubscription,
);
app.delete(
  '/api/admin/users/:uid/subscription',
  adminAuthMiddleware,
  adminRateLimiter,
  revokeSubscription,
);

// A rota em lote vem antes da rota por ticker: sem isso "dividend-history"
// seria capturado como :ticker.
app.get('/api/quotes/dividend-history', getDividendHistoryBatch);
app.get('/api/quotes/:ticker/dividend-history', getDividendHistory);

app.get('/api/wallets', listWallets);
app.post('/api/wallets', createWallet);
app.get('/api/wallets/:id', getWallet);
app.put('/api/wallets/:id', updateWallet);
app.delete('/api/wallets/:id', deleteWallet);

// Agregados de todas as carteiras (issue #300). As rotas por carteira
// continuam servindo a tela de Carteira, que mostra uma de cada vez.
app.get('/api/monthly-income', getConsolidatedMonthlyIncome);
app.get('/api/dashboard/summary', getDashboardSummary);

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
app.get(
  '/api/recommended-wallets/bb-fii/suggestions',
  requireEntitlement('ai'),
  getSuggestion,
);
app.post(
  '/api/recommended-wallets/bb-fii/suggestions',
  requireEntitlement('ai'),
  generateSuggestion,
);
app.post(
  '/api/recommended-wallets/bb-fii/suggestions/:id/applied',
  requireEntitlement('ai'),
  applySuggestionItem,
);
app.post(
  '/api/admin/recommended-wallets/bb-fii/import',
  adminAuthMiddleware,
  adminRateLimiter,
  importRecommended,
);
app.put(
  '/api/admin/recommended-wallets/bb-fii/:id/confirm',
  adminAuthMiddleware,
  adminRateLimiter,
  confirmRecommended,
);

// Rede de segurança para erros que não nascem dentro de um handler de rota e
// por isso não passam pelo asyncHandler (issue #222): body malformado no
// express.json/raw, falha do rate limiter e do middleware de log. Os handlers
// de rota tratam o próprio erro no wrapper e não chegam aqui.
export function unhandledErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logError('unhandledError', {
    method: req.method,
    path: req.path,
    message: err.message,
    stack: err.stack,
  });

  // Corpo acima do limite é erro do cliente: responder 500 esconderia a causa
  // de quem está integrando (issue #298). O body-parser preenche `status`; o
  // `HttpError` do projeto usa `statusCode`, então os dois são aceitos.
  const { status, statusCode } = err as {
    status?: number;
    statusCode?: number;
  };
  if ((status ?? statusCode) === 413) {
    res.status(413).json({ error: 'Corpo da requisição muito grande' });
    return;
  }

  res.status(500).json({ error: 'Erro interno do servidor' });
}

app.use(unhandledErrorHandler);

// Os segredos são configurados com:
//   firebase functions:secrets:set OPENROUTER_API_KEY
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
export const api = onRequest(
  {
    secrets: [
      'OPENROUTER_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ],
    timeoutSeconds: 180,
  },
  app,
);

// Cloud Function agendada para atualizar cotações 1x ao dia, às 19:30, depois
// que todas as fases do pregão se encerraram: na grade vigente desde março de
// 2026 o pregão regular vai até 17:00, o after-market das 17:30 às 18:00 e o
// cancelamento de ofertas até 18:45. Às 18:30, horário anterior, a Brapi ainda
// servia o último negócio do pregão contínuo em vez do preço do leilão de
// fechamento — o carimbo da cotação vinha praticamente colado no horário do
// job (issue #388).
// Os três agendamentos diários abaixo formam uma cadeia — cotações, snapshot
// patrimonial e preço-alvo — e se movem em bloco: os dois últimos leem o preço
// gravado pelo primeiro.
// Ver issues #10, #22, #192 e #212 — busca cotações via Brapi (fonte única)
// e salva em `quotes/{ticker}` + histórico.
// O segredo BRAPI_API_KEY é vinculado via `secrets` para ficar disponível
// em process.env dentro da execução. Configurar com:
//   firebase functions:secrets:set BRAPI_API_KEY
export const updateQuotesScheduled = onSchedule(
  {
    schedule: '30 19 * * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
    secrets: ['BRAPI_API_KEY'],
    // Além das cotações, registra os proventos pagos para quem tem cada
    // ativo (#112); em dia de pagamento de muitos FIIs os 60s padrão não
    // bastam.
    timeoutSeconds: 300,
  },
  async () => {
    await updateAllQuotes();
  },
);

// Snapshot diário do patrimônio, 30 min após a atualização de cotações
// (19:30 → 20:00), para registrar o patrimônio com a data e os preços já
// consolidados do pregão do dia (issue #388).
export const savePatrimonySnapshotsScheduled = onSchedule(
  {
    schedule: '0 20 * * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
  },
  async () => {
    await saveAllPatrimonySnapshots();
  },
);

// Verificação diária de preço-alvo da geladeira, 15 min após o snapshot
// patrimonial (20:00 → 20:15), para comparar com as cotações do dia já
// consolidadas depois do after-market (issues #118 e #388).
// O aviso por e-mail usa a API do Resend (issue #265); configurar o segredo com:
//   firebase functions:secrets:set RESEND_API_KEY
export const checkTargetPricesScheduled = onSchedule(
  {
    schedule: '15 20 * * *',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
    secrets: ['RESEND_API_KEY'],
    // Varre todos os usuários, com uma leitura por geladeira; os 60s padrão
    // não bastam conforme a base cresce, e o retry reexecutaria a varredura
    // inteira três vezes.
    timeoutSeconds: 300,
  },
  async () => {
    await checkAllTargetPrices();
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
