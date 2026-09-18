import { fetchQuotes, QuoteResult } from './brapi.service';
import { DividendInfo, fetchMonthlyDividends } from './dividend-fetch.service';
import { saveQuoteHistory } from './quote-history.service';
import { listActiveAssetTickers } from '../assets/asset.service';

// Processa os tickers com cotação em lotes, para não disparar centenas de
// escritas simultâneas no Firestore (nem sobrecarregar limites de taxa)
// conforme o catálogo de ativos crescer.
const BATCH_SIZE = 10;

// A Brapi é a fonte oficial e única de cotações e proventos (issue #212).
const QUOTE_SOURCE = 'brapi';

async function processTickerQuote(
  ticker: string,
  quote: QuoteResult,
  dividend: DividendInfo | undefined,
): Promise<void> {
  try {
    await saveQuoteHistory(
      ticker,
      quote.price,
      dividend?.monthlyDividend,
      QUOTE_SOURCE,
      dividend?.paymentDate,
      dividend?.annualDividend,
    );
    console.log(
      `[updateAllQuotes] ${ticker}: atualizado para R$ ${quote.price} (${QUOTE_SOURCE}).`,
    );
  } catch (error) {
    console.error(`[updateAllQuotes] Erro ao atualizar ${ticker}:`, {
      message: (error as Error).message,
    });
  }
}

/**
 * Busca cotações na Brapi, a fonte oficial e única do DinDin.
 *
 * Tickers sem cotação são apenas logados. Lança erro quando a Brapi falha por
 * completo, para que o scheduler acione o retry.
 */
async function fetchBrapiQuotes(
  tickerList: string[],
): Promise<Map<string, QuoteResult>> {
  let quotes: Map<string, QuoteResult>;
  try {
    quotes = await fetchQuotes(tickerList);
  } catch (error) {
    const brapiError = error as Error;
    console.error('[updateAllQuotes] Erro ao buscar cotações na Brapi:', {
      message: brapiError.message,
    });
    throw new Error(`Nenhuma cotação obtida na Brapi: ${brapiError.message}`);
  }

  const withoutQuote = tickerList.filter((ticker) => !quotes.has(ticker));
  if (withoutQuote.length > 0) {
    console.warn('[updateAllQuotes] Tickers sem cotação na Brapi:', {
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
    const quotes = await fetchBrapiQuotes(tickerList);

    let dividends: Map<string, DividendInfo>;
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
          processTickerQuote(ticker, quote, dividends.get(ticker)),
        ),
      );
    }

    console.log(
      `[updateAllQuotes] Concluído. ${quotes.size} de ${assetList.length} ticker(s) do catálogo atualizado(s) via Brapi.`,
    );
  } catch (error) {
    console.error('[updateAllQuotes] error:', {
      message: (error as Error).message,
    });
    throw error;
  }
}
