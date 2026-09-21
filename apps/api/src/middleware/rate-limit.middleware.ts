import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

/** Chave do contador quando o IP do cliente não pôde ser resolvido. */
const UNKNOWN_IP_KEY = 'unknown-ip';

/** Janela e limite de requisições por IP em todas as rotas autenticadas. */
export const API_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 100,
};

/**
 * Limita `/api/*` por IP antes do authMiddleware, para que chamadas em massa
 * não cheguem ao `verifyIdToken`. O uid ainda não existe nesse ponto, por isso
 * a chave é o `req.ip` (resolvido via `trust proxy`, já que a Function fica
 * atrás do Firebase Hosting/Cloud Run). O contador fica em memória, por
 * instância da Function — mitigação aceita, sem store distribuído.
 *
 * Risco aceito: com `trust proxy` = true o IP vem do X-Forwarded-For, que pode
 * ser forjado por quem chama a URL da Function diretamente. Fixar o número de
 * hops exige confirmar a cadeia Hosting → Cloud Run em produção; errar faria
 * todo o tráfego do Hosting compartilhar um único contador.
 *
 * Sem IP resolvido (ex.: emulador do Functions, sem X-Forwarded-For nem
 * socket), as requisições caem num contador compartilhado em vez de o gerador
 * padrão lançar erro e derrubar a rota com 500.
 */
export const apiRateLimiter = rateLimit({
  ...API_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : UNKNOWN_IP_KEY),
  message: { error: 'Muitas requisições' },
  validate: { trustProxy: false },
});

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
  message: { error: 'Muitas requisições' },
});
