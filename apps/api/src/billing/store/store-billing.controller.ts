import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler';
import { logError, logWarn } from '../../shared/logger';
import { StoreBillingError } from './store-errors';
import {
  applyStoreNotification,
  registerStorePurchase,
} from './store-purchase.service';
import {
  getStoreNotificationVerifier,
  InvalidNotificationError,
  StorePlatform,
} from './store-validators';

const PLATFORMS: StorePlatform[] = ['apple', 'google'];

function respondBusinessError(res: Response, error: unknown): boolean {
  if (!(error instanceof StoreBillingError)) return false;
  res.status(error.statusCode).json({ error: error.message, code: error.code });
  return true;
}

/**
 * Recebe o recibo do app e devolve a assinatura depois da validação com a
 * loja. Também é a **restauração**: o mesmo recibo, do mesmo usuário,
 * regrava o estado.
 */
export const registerStorePurchaseHandler = asyncHandler(
  'registerStorePurchase',
  async (req: Request, res: Response) => {
    const { platform, productId, credential } = req.body ?? {};
    if (
      !PLATFORMS.includes(platform) ||
      typeof productId !== 'string' ||
      productId === '' ||
      typeof credential !== 'string' ||
      credential === ''
    ) {
      res
        .status(400)
        .json({ error: 'platform, productId e credential são obrigatórios' });
      return;
    }

    try {
      const subscription = await registerStorePurchase({
        uid: (req as AuthRequest).user!.uid,
        platform,
        productId,
        credential,
      });
      res.json(subscription);
    } catch (error) {
      if (!respondBusinessError(res, error)) throw error;
    }
  },
);

/**
 * Webhook de servidor de uma loja. Fica fora do `authMiddleware`: quem
 * autentica é o verificador da loja, nunca o corpo. Falha ao aplicar devolve
 * 500 para a loja reenviar.
 */
export function handleStoreNotification(platform: StorePlatform) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const verifier = getStoreNotificationVerifier(platform);
      const notification = await verifier.verify({
        body: req.body,
        headers: req.headers,
      });
      if (notification) {
        await applyStoreNotification({ platform, ...notification });
      }
      res.json({ received: true });
    } catch (error) {
      if (error instanceof InvalidNotificationError) {
        logWarn('billing.store.invalidNotification', { platform });
        res.status(400).json({ error: 'Notificação inválida' });
        return;
      }
      if (respondBusinessError(res, error)) return;
      logError('billing.store.notificationFailed', {
        platform,
        message: (error as Error).message,
      });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  };
}
