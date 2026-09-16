import { Request, Response } from 'express';
import { AuthRequest } from './auth.middleware';

/** Handler de rota que só cuida do caminho feliz e das respostas de negócio. */
type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

/**
 * Envolve um handler de rota, capturando qualquer erro não tratado (issue #222).
 *
 * Antes, cada um dos ~55 handlers repetia `try` → `console.error` → 500. Além
 * de afogar a regra de negócio — em `wallet.controller` o tratamento de erro
 * ocupava mais linhas que a lógica — cada `console.error` escolhia seu próprio
 * conjunto de campos, deixando o log de produção inconsistente.
 *
 * O `name` identifica a origem no log e é o único parâmetro que o chamador
 * precisa informar; método, rota, uid e params saem da própria requisição.
 *
 * O corpo da requisição **não** é logado. A maioria dos handlers já não o
 * logava, e o que trafega aqui é dado financeiro do usuário: método, rota,
 * params e stack bastam para localizar a falha sem despejar a carteira de
 * alguém no Cloud Logging.
 */
export function asyncHandler(name: string, handler: RouteHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(`[${name}] error:`, {
        method: req.method,
        path: req.path,
        uid: (req as AuthRequest).user?.uid,
        params: req.params,
        message: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Um handler pode falhar depois de já ter respondido; um segundo status
      // quebraria a resposta que o cliente já está recebendo.
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}
