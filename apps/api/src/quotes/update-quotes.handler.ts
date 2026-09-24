import { QuoteResult } from './brapi.service';
import { fetchCatalogQuotes } from './catalog-quotes';
import { DividendInfo, fetchMonthlyDividends } from './dividend-fetch.service';
import { saveQuoteHistory } from './quote-history.service';
import { listActiveAssetTickers } from '../assets/asset.service';
import { recordPaidDividends } from '../dividend/dividend-sync-record.service';
import { today } from '../shared/date';
import { logError, logInfo } from '../shared/logger';

// Processa os tickers com cotação em lotes, para não disparar centenas de
// escritas simultâneas no Firestore (nem sobrecarregar limites de taxa)
// conforme o catálogo de ativos crescer.
const BATCH_SIZE = 10;

// A Brapi é a fonte oficial e única de cotações e proventos (issue #212).
const QUOTE_SOURCE = 'brapi';

async function recordTickerDividends(
  ticker: string,
  dividend: DividendInfo | undefined,
  today: string,
): Promise<void> {
  if (!dividend?.paidEvents && !dividend?.upcomingEvents) {
    return;
  }
  // Os anunciados entram para a foto da data-com (#278); o registro só
  // considera os pagamentos até hoje.
  const events = [
    ...(dividend.paidEvents ?? []),
    ...(dividend.upcomingEvents ?? []),
  ];
  try {
    await recordPaidDividends(ticker, events, today);
  } catch (error) {
    logError('updateAllQuotes.dividendFailed', {
      ticker,
      message: (error as Error).message,
    });
  }
}

async function processTickerQuote(
  ticker: string,
  quote: QuoteResult,
  dividend: DividendInfo | undefined,
  today: string,
): Promise<void> {
  try {
    await saveQuoteHistory(
      ticker,
      quote.price,
      dividend?.monthlyDividend,
      QUOTE_SOURCE,
      dividend?.paymentDate,
      dividend?.annualDividend,
      quote.quotedAt,
    );
    logInfo('updateAllQuotes.tickerUpdated', {
      ticker,
      price: quote.price,
      // Horário de apuração na fonte (#387): é o que permite medir no Cloud
      // Logging a que horas a Brapi consolida o fechamento de cada pregão.
      quotedAt: quote.quotedAt,
      source: QUOTE_SOURCE,
    });
  } catch (error) {
    logError('updateAllQuotes.tickerFailed', {
      ticker,
      message: (error as Error).message,
    });
  }
  // Registra os proventos pagos nos usuários (#112). O estado do registro
  // só é gravado após o commit, então uma falha aqui é refeita no próximo sync.
  await recordTickerDividends(ticker, dividend, today);
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
      logInfo('updateAllQuotes.emptyCatalog');
      return;
    }

    logInfo('updateAllQuotes.start', { tickers: assetList.length });

    const tickerList = assetList.map((asset) => asset.ticker);
    const quotes = await fetchCatalogQuotes(tickerList, 'updateAllQuotes');

    let dividends: Map<string, DividendInfo>;
    try {
      dividends = await fetchMonthlyDividends(assetList);
    } catch (error) {
      logError('updateAllQuotes.dividendsFailed', {
        message: (error as Error).message,
      });
      dividends = new Map();
    }

    const date = today();
    const tickerEntries = [...quotes.entries()];
    for (let i = 0; i < tickerEntries.length; i += BATCH_SIZE) {
      const batch = tickerEntries.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(([ticker, quote]) =>
          processTickerQuote(ticker, quote, dividends.get(ticker), date),
        ),
      );
    }

    logInfo('updateAllQuotes.done', {
      updated: quotes.size,
      tickers: assetList.length,
    });
  } catch (error) {
    logError('updateAllQuotes.failed', {
      message: (error as Error).message,
    });
    throw error;
  }
}
