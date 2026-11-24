/**
 * Erro HTTP de um provedor de dados de mercado, com o status para decidir se
 * vale repetir a consulta ou recorrer ao provedor seguinte (#598).
 */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

// Status que afetam todas as requisições ao provedor (autenticação, permissão
// e limite de taxa): insistir ticker a ticker só multiplicaria as recusas.
const BLOCKING_STATUSES = new Set([401, 403, 429]);

/** Se o erro indica que o provedor recusou todas as requisições. */
export function isBlockingError(error: unknown): error is ProviderHttpError {
  return (
    error instanceof ProviderHttpError && BLOCKING_STATUSES.has(error.status)
  );
}
