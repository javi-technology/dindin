import { Response, NextFunction } from 'express';
import { Entitlement } from 'dindin-shared-types';
import { AuthRequest } from './auth.middleware';
import { hasEntitlement } from '../billing/entitlement.service';

/** Exige que o usuário autenticado possua o entitlement informado (403 SUBSCRIPTION_REQUIRED). */
export function requireEntitlement(entitlement: Entitlement) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
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
          .json({ error: 'Forbidden', code: 'SUBSCRIPTION_REQUIRED' });
        return;
      }
      next();
    } catch (error) {
      console.error('[requireEntitlement] erro ao verificar assinatura', {
        uid: req.user.uid,
        entitlement,
        error,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
