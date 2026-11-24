import { logError } from '../shared/logger';
import { isBlockingError } from './provider-http-error';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Consulta a Brapi em lotes. A falha de um lote é logada e não impede os
 * seguintes: um ticker recusado ou uma falha pontual não deixa os demais sem
 * dados. No plano gratuito o lote é de um ticker (#598).
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

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    try {
      for (const [ticker, value] of await fetchBatch(batch)) {
        resultMap.set(ticker, value);
      }
    } catch (error) {
      lastError = toError(error);
      logError(errorLogMessage, {
        tickers: batch,
        message: lastError.message,
      });
      // Bloqueio vale para todas as requisições: seguir para os próximos
      // lotes só gastaria a cota do plano gratuito com recusas (#598).
      if (isBlockingError(lastError)) break;
    }
  }

  if (lastError && resultMap.size === 0) {
    throw lastError;
  }

  return resultMap;
}
