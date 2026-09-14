import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

/** Janela e limite de requisições por usuário nas rotas admin. */
export const ADMIN_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 60,
};

/**
 * Limita as rotas admin por usuário autenticado. Usa o uid (e não o IP) porque
 * atrás do proxy do Cloud Functions o IP não identifica o cliente com
 * segurança. O contador fica em memória, por instância da Function.
 */
export const adminRateLimiter = rateLimit({
  ...ADMIN_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) =>
    req.user?.uid ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: 'Too many requests' },
});
