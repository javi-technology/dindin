import { QuoteResult } from './brapi.service';
import { fetchCatalogQuotes } from './catalog-quotes';
import { saveReconciledPrice } from './quote-history.service';
import { getQuotesByTicker } from './quote-prices';
import { listActiveAssetTickers } from '../assets/asset.service';
import { logError, logInfo } from '../shared/logger';
import { Quote } from 'dindin-models';

// Mesmo lote do job diário: escrever todos os tickers de uma vez estouraria
// os limites de taxa do Firestore conforme o catálogo crescer.
const BATCH_SIZE = 10;

// A Brapi é a fonte oficial e única de cotações e proventos (issue #212).
const QUOTE_SOURCE = 'brapi';

/**
 * Se a cotação vinda da fonte foi apurada depois da que já está gravada.
 *
 * Sem horário de apuração na resposta não há como provar que o dado é mais
 * novo — pode ser a mesma leitura em cache —, e sobrescrever seria trocar um
 * fechamento consolidado por um palpite. Cotação gravada antes da #387 não
 * tem o campo, e aí qualquer apuração conhecida é ganho de informação.
 */
function isNewerQuote(quote: QuoteResult, stored: Quote | undefined): boolean {
  if (!quote.quotedAt) return false;
  if (!stored?.quotedAt) return true;
  return Date.parse(quote.quotedAt) > Date.parse(stored.quotedAt);
}

/** `true` quando o preço foi de fato corrigido. */
async function reconcileTicker(
  ticker: string,
  quote: QuoteResult,
  stored: Quote | undefined,
): Promise<boolean> {
  if (!isNewerQuote(quote, stored)) return false;

  try {
    // Caminho dedicado, que não passa pelo histórico mensal de proventos: a
    // reconciliação corrige preço, e regravar aquele registro toda noite o
    // marcaria como atualizado sem nenhum provento novo por trás.
    await saveReconciledPrice(
      ticker,
      quote.price,
      stored,
      quote.quotedAt,
      QUOTE_SOURCE,
    );
    logInfo('reconcileQuotes.priceReconciled', {
      ticker,
      previousPrice: stored?.price,
      price: quote.price,
      difference:
        stored?.price === undefined ? undefined : quote.price - stored.price,
      quotedAt: quote.quotedAt,
    });
    return true;
  } catch (error) {
    // Uma gravação que falha não interrompe os demais tickers: o próximo
    // pregão volta a tentar, e parar aqui deixaria a maior parte do catálogo
    // sem reconciliação por causa de um ticker.
    logError('reconcileQuotes.tickerFailed', {
      ticker,
      message: (error as Error).message,
    });
    return false;
  }
}

/**
 * Reconciliação noturna do preço de fechamento (issue #389).
 *
 * Mesmo depois de atrasar a cadeia diária para depois do after-market (#388),
 * não há garantia de que a Brapi já consolidou o fechamento: ela chegou a
 * servir o último negócio do pregão contínuo mais de uma hora depois do
 * encerramento. Este job volta mais tarde e corrige **apenas o preço**.
 *
 * Reexecutar o `updateAllQuotes` não serviria: ele também registra proventos
 * e tira a foto de data-com, varrendo todos os usuários. O registro é
 * idempotente, mas a varredura extra custa leituras sem necessidade.
 *
 * A gravação é a mesma do job diário (`saveQuoteHistory`); o que muda é a
 * guarda: só sobrescreve quando a fonte apurou depois do que está gravado.
 */
export async function reconcileClosingQuotes(): Promise<void> {
  try {
    const assetList = await listActiveAssetTickers();

    if (assetList.length === 0) {
      logInfo('reconcileQuotes.emptyCatalog');
      return;
    }

    const tickerList = assetList.map((asset) => asset.ticker);
    logInfo('reconcileQuotes.start', { tickers: tickerList.length });

    const quotes = await fetchCatalogQuotes(tickerList, 'reconcileQuotes');
    const stored = await getQuotesByTicker(tickerList);

    let reconciled = 0;
    const entries = [...quotes.entries()];
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(([ticker, quote]) =>
          reconcileTicker(ticker, quote, stored.get(ticker)),
        ),
      );
      reconciled += results.filter(
        (result) => result.status === 'fulfilled' && result.value,
      ).length;
    }

    logInfo('reconcileQuotes.done', {
      tickers: tickerList.length,
      reconciled,
    });
  } catch (error) {
    logError('reconcileQuotes.failed', { message: (error as Error).message });
    throw error;
  }
}
