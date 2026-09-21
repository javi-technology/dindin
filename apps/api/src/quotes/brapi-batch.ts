import { logError } from '../shared/logger';
/** Erro HTTP da Brapi, com o status para decidir se vale repetir a consulta. */
export class BrapiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BrapiHttpError';
  }
}

// Status que afetam todas as requisições (autenticação, permissão e limite de
// taxa): repetir ticker a ticker só multiplicaria as falhas.
const NON_ISOLATABLE_STATUSES = new Set([401, 403, 429]);

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function canIsolate(error: Error): boolean {
  return !(
    error instanceof BrapiHttpError && NON_ISOLATABLE_STATUSES.has(error.status)
  );
}

/**
 * Consulta a Brapi em lotes. Quando um lote com mais de um ticker falha, os
 * tickers dele são consultados um a um, para que um único símbolo recusado
 * (ex.: ETF no endpoint de proventos de ações) ou uma falha pontual não deixe
 * os demais sem dados.
 *
 * Lança o último erro apenas quando nenhum ticker retornou dados.
 */
export async function fetchInBatches<T>(
  tickers: string[],
  batchSize: number,
  fetchBatch: (batch: string[]) => Promise<Map<string, T>>,
  errorLogMessage: string,
): Promise<Map<string, T>> {
  const resultMap = new Map<string, T>();
  let lastError: Error | undefined;

  const attempt = async (batch: string[]): Promise<Error | undefined> => {
    try {
      for (const [ticker, value] of await fetchBatch(batch)) {
        resultMap.set(ticker, value);
      }
      return undefined;
    } catch (error) {
      lastError = toError(error);
      logError(errorLogMessage, {
        tickers: batch,
        message: lastError.message,
      });
      return lastError;
    }
  };

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const error = await attempt(batch);
    if (error && batch.length > 1 && canIsolate(error)) {
      for (const ticker of batch) {
        await attempt([ticker]);
      }
    }
  }

  if (lastError && resultMap.size === 0) {
    throw lastError;
  }

  return resultMap;
}
