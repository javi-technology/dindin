import { Request, Response } from 'express';
import { AuthRequest } from './auth.middleware';

/** Handler de rota que só cuida do caminho feliz e das respostas de negócio. */
type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

/**
 * Status HTTP anexado ao erro pelo próprio serviço, quando a falha é de
 * negócio e não interna — um PDF ilegível é 400, não 500.
 */
function statusCodeOf(error: unknown): number {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;

  return typeof statusCode === 'number' ? statusCode : 500;
}

/**
 * Se a mensagem do erro pode ir para o cliente (convenção do `http-errors`).
 *
 * Por padrão só 4xx expõem: são falhas de negócio escritas para o usuário. Um
 * 5xx só expõe quando a aplicação marca `expose: true`, como o 502 da
 * ai-suggestion, cujo texto é de interface. Sem essa marca, um erro de
 * biblioteca que traga `statusCode` — os do SDK da Stripe trazem — teria o
 * texto interno repassado ao cliente.
 */
function exposeOf(error: unknown, statusCode: number): boolean {
  const expose =
    typeof error === 'object' && error !== null && 'expose' in error
      ? (error as { expose?: unknown }).expose
      : undefined;

  return typeof expose === 'boolean' ? expose : statusCode < 500;
}

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
      if (res.headersSent) return;

      // Mensagem não exposta fica só no log, acima.
      const code = statusCodeOf(error);
      res.status(code).json({
        error: exposeOf(error, code)
          ? (error as Error).message
          : 'Internal server error',
      });
    }
  };
}
