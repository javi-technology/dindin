import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from './middleware/auth.middleware';
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
  updatePosition,
} from './wallet/position.controller';

admin.initializeApp();

const app = express();
app.use(express.json());

// Middleware de log de requisições para diagnóstico em produção
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;

  // Captura o fim da resposta para logar status e duração
  const originalJson = _res.json.bind(_res);
  _res.json = function (body: unknown) {
    const duration = Date.now() - start;
    console.log(
      `[${method}] ${path} → ${_res.statusCode} (${duration}ms)`,
    );
    return originalJson(body);
  };

  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', project: 'dindin' });
});

app.use('/api/*', authMiddleware);

app.get('/api/me', (req: AuthRequest, res: Response) => {
  res.json({ uid: req.user?.uid });
});

app.get('/api/wallets', listWallets);
app.post('/api/wallets', createWallet);
app.get('/api/wallets/:id', getWallet);
app.put('/api/wallets/:id', updateWallet);
app.delete('/api/wallets/:id', deleteWallet);

app.get('/api/wallets/:walletId/positions', listPositions);
app.post('/api/wallets/:walletId/positions', createPosition);
app.get('/api/wallets/:walletId/positions/:id', getPosition);
app.put('/api/wallets/:walletId/positions/:id', updatePosition);
app.delete('/api/wallets/:walletId/positions/:id', deletePosition);

// Middleware global de tratamento de erros não capturados
app.use(
  (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
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
export { app };
