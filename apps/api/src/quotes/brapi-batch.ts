import { logError } from '../shared/logger';
import { isBlockingError } from './provider-http-error';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Consulta a Brapi em lotes. Quando um lote com mais de um ticker falha, os
 * tickers dele são consultados um a um, para que um único símbolo recusado
 * (ex.: ETF no endpoint de proventos de ações) ou uma falha pontual não deixe
 * os demais sem dados.
 *
 * Um bloqueio (401, 403, 429) interrompe os lotes seguintes.
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
    // Bloqueio vale para todas as requisições: seguir para os próximos lotes
    // só gastaria a cota do plano gratuito com recusas (#598).
    if (isBlockingError(error)) break;
    if (error && batch.length > 1) {
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
