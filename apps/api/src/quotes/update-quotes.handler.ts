import { fetchQuotes, QuoteResult } from './brapi.service';
import { saveQuoteHistory } from './quote-history.service';
import { listActiveAssetTickers } from '../assets/asset.service';

async function processTickerQuote(
  ticker: string,
  quote: QuoteResult,
): Promise<void> {
  try {
    await saveQuoteHistory(ticker, quote.price, 'brapi');
    console.log(
      `[updateAllQuotes] ${ticker}: atualizado para R$ ${quote.price}.`,
    );
  } catch (error) {
    console.error(`[updateAllQuotes] Erro ao atualizar ${ticker}:`, {
      message: (error as Error).message,
    });
  }
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
    const tickerList = await listActiveAssetTickers();

    if (tickerList.length === 0) {
      console.log('[updateAllQuotes] Nenhum ativo ativo no catálogo.');
      return;
    }

    console.log(
      `[updateAllQuotes] Buscando cotações para ${tickerList.length} ticker(s) do catálogo.`,
    );

    let quotes: Map<string, QuoteResult>;
    try {
      quotes = await fetchQuotes(tickerList);
    } catch (error) {
      console.error('[updateAllQuotes] error:', {
        message: (error as Error).message,
      });
      return;
    }

    await Promise.allSettled(
      [...quotes.entries()].map(([ticker, quote]) =>
        processTickerQuote(ticker, quote),
      ),
    );

    console.log(
      `[updateAllQuotes] Concluído. ${quotes.size} de ${tickerList.length} ticker(s) do catálogo atualizado(s).`,
    );
  } catch (error) {
    console.error('[updateAllQuotes] error:', {
      message: (error as Error).message,
    });
    throw error;
  }
}
