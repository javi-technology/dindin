import { Response, NextFunction } from 'express';
import { Entitlement } from 'dindin-shared-types';
import { AuthRequest } from './auth.middleware';
import { hasEntitlement } from '../billing/entitlement.service';
import { logError } from '../shared/logger';

/** Exige que o usuário autenticado possua o entitlement informado (403 SUBSCRIPTION_REQUIRED). */
export function requireEntitlement(entitlement: Entitlement) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    try {
      const allowed = await hasEntitlement(
        req.user.uid,
        entitlement,
        req.user.admin === true,
      );
      if (!allowed) {
        res
          .status(403)
          .json({ error: 'Acesso negado', code: 'SUBSCRIPTION_REQUIRED' });
        return;
      }
      next();
    } catch (error) {
      logError('requireEntitlement.failed', {
        uid: req.user.uid,
        entitlement,
        message: (error as Error).message,
      });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  };
}
