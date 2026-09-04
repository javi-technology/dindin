import { fetchQuotes, QuoteResult } from './brapi.service';
import { fetchYahooQuotes } from './yahoo-quote.service';
import { fetchMonthlyDividends } from './dividend-fetch.service';
import { saveQuoteHistory } from './quote-history.service';
import { listActiveAssetTickers } from '../assets/asset.service';

// Processa os tickers com cotação em lotes, para não disparar centenas de
// escritas simultâneas no Firestore (nem sobrecarregar limites de taxa)
// conforme o catálogo de ativos crescer.
const BATCH_SIZE = 10;

type QuoteSource = 'brapi' | 'yahoo';

interface SourcedQuote extends QuoteResult {
  source: QuoteSource;
}

async function processTickerQuote(
  ticker: string,
  quote: SourcedQuote,
  monthlyDividend: number | undefined,
): Promise<void> {
  try {
    await saveQuoteHistory(ticker, quote.price, monthlyDividend, quote.source);
    console.log(
      `[updateAllQuotes] ${ticker}: atualizado para R$ ${quote.price} (${quote.source}).`,
    );
  } catch (error) {
    console.error(`[updateAllQuotes] Erro ao atualizar ${ticker}:`, {
      message: (error as Error).message,
    });
  }
}

/**
 * Busca cotações na Brapi e, para os tickers que ficaram sem preço (ou se a
 * Brapi falhar por completo), tenta o Yahoo Finance como fallback.
 *
 * Lança erro apenas quando a Brapi falhou E nenhuma fonte retornou cotação,
 * para que o scheduler acione o retry.
 */
async function fetchQuotesWithFallback(
  tickerList: string[],
): Promise<Map<string, SourcedQuote>> {
  const quotes = new Map<string, SourcedQuote>();
  let brapiError: Error | undefined;

  try {
    for (const [ticker, quote] of await fetchQuotes(tickerList)) {
      quotes.set(ticker, { ...quote, source: 'brapi' });
    }
  } catch (error) {
    brapiError = error as Error;
    console.error('[updateAllQuotes] Erro ao buscar cotações na Brapi:', {
      message: brapiError.message,
    });
  }

  const missingTickers = tickerList.filter((ticker) => !quotes.has(ticker));
  if (missingTickers.length > 0) {
    const yahooQuotes = await fetchYahooQuotes(missingTickers);
    for (const [ticker, quote] of yahooQuotes) {
      quotes.set(ticker, { ...quote, source: 'yahoo' });
    }
    console.log(
      `[updateAllQuotes] Fallback Yahoo: ${yahooQuotes.size} de ${missingTickers.length} ticker(s) recuperado(s).`,
    );
  }

  if (brapiError && quotes.size === 0) {
    throw new Error(
      `Nenhuma cotação obtida (Brapi e Yahoo Finance falharam): ${brapiError.message}`,
    );
  }

  const withoutQuote = tickerList.filter((ticker) => !quotes.has(ticker));
  if (withoutQuote.length > 0) {
    console.warn('[updateAllQuotes] Tickers sem cotação em nenhuma fonte:', {
      tickers: withoutQuote,
    });
  }

  return quotes;
}

/**
 * Atualiza as cotações de todos os ativos ativos do catálogo (`assets`).
 *
 * Diferente da versão anterior, os tickers a consultar não são mais
 * descobertos escaneando todas as posições/itens da geladeira de todos os
 * usuários (`collectionGroup`) — o que fazia o custo e o tempo de execução
 * crescerem com o número de usuários. Agora eles vêm do catálogo de ativos
 * suportados, cujo tamanho é fixo e não cresce com a base de usuários.
 *
 * A cotação é salva apenas em `quotes/{ticker}` (+ histórico). O preço
 * exibido em posições e itens da geladeira é resolvido a partir dessa
 * collection no momento da leitura (ver `withCurrentPrices` nos
 * controllers), eliminando o fan-out de escritas em cada posição/item de
 * cada usuário a cada atualização de cotação (ver issue #86).
 */
export async function updateAllQuotes(): Promise<void> {
  try {
    const assetList = await listActiveAssetTickers();

    if (assetList.length === 0) {
      console.log('[updateAllQuotes] Nenhum ativo ativo no catálogo.');
      return;
    }

    console.log(
      `[updateAllQuotes] Buscando cotações para ${assetList.length} ticker(s) do catálogo.`,
    );

    const tickerList = assetList.map((asset) => asset.ticker);
    const quotes = await fetchQuotesWithFallback(tickerList);

    let dividends: Map<string, number>;
    try {
      dividends = await fetchMonthlyDividends(assetList);
    } catch (error) {
      console.error('[updateAllQuotes] error ao buscar dividendos:', {
        message: (error as Error).message,
      });
      dividends = new Map();
    }

    const tickerEntries = [...quotes.entries()];
    for (let i = 0; i < tickerEntries.length; i += BATCH_SIZE) {
      const batch = tickerEntries.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(([ticker, quote]) =>
          processTickerQuote(
            ticker,
            quote,
            dividends.has(ticker) ? dividends.get(ticker) : undefined,
          ),
        ),
      );
    }

    const bySource = { brapi: 0, yahoo: 0 };
    for (const quote of quotes.values()) bySource[quote.source]++;
    console.log(
      `[updateAllQuotes] Concluído. ${quotes.size} de ${assetList.length} ticker(s) do catálogo atualizado(s) (brapi: ${bySource.brapi}, yahoo: ${bySource.yahoo}).`,
    );
  } catch (error) {
    console.error('[updateAllQuotes] error:', {
      message: (error as Error).message,
    });
    throw error;
  }
}
