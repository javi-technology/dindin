import { SourcedQuote } from './quote-provider';
import { fetchCatalogQuotes } from './catalog-quotes';
import { CotahistQuote, fetchCotahistClosingPrices } from './cotahist';
import { saveReconciledPrice } from './quote-history.service';
import { getQuotesByTicker } from './quote-prices';
import { listActiveAssetTickers } from '../assets/asset.service';
import { today } from '../shared/date';
import { logError, logInfo, logWarn } from '../shared/logger';
import { Quote } from 'dindin-models';

// Mesmo lote do job diário: escrever todos os tickers de uma vez estouraria
// os limites de taxa do Firestore conforme o catálogo crescer.
const BATCH_SIZE = 10;

/**
 * Se a cotação vinda da fonte foi apurada depois da que já está gravada.
 *
 * Sem horário de apuração na resposta não há como provar que o dado é mais
 * novo — pode ser a mesma leitura em cache —, e sobrescrever seria trocar um
 * fechamento consolidado por um palpite. Cotação gravada antes da #387 não
 * tem o campo, e aí qualquer apuração conhecida é ganho de informação.
 */
function isNewerQuote(quote: SourcedQuote, stored: Quote | undefined): boolean {
  if (!quote.quotedAt) return false;
  if (!stored?.quotedAt) return true;
  return Date.parse(quote.quotedAt) > Date.parse(stored.quotedAt);
}

// Fechamento do leilão publicado pela B3 no COTAHIST (#600).
const OFFICIAL_SOURCE = 'b3-cotahist';

/**
 * Preço a gravar. O COTAHIST não informa horário, e o preço oficial é gravado
 * sem `quotedAt`: inventar um horário contrariaria a #387.
 */
type Correction = SourcedQuote;

/** `true` quando o preço foi de fato corrigido. */
async function reconcileTicker(
  ticker: string,
  quote: Correction,
  stored: Quote | undefined,
): Promise<boolean> {
  try {
    // Caminho dedicado, que não passa pelo histórico mensal de proventos: a
    // reconciliação corrige preço, e regravar aquele registro toda noite o
    // marcaria como atualizado sem nenhum provento novo por trás.
    await saveReconciledPrice(
      ticker,
      quote.price,
      stored,
      quote.quotedAt,
      quote.source,
    );
    logInfo('reconcileQuotes.priceReconciled', {
      ticker,
      previousPrice: stored?.price,
      price: quote.price,
      difference:
        stored?.price === undefined ? undefined : quote.price - stored.price,
      quotedAt: quote.quotedAt,
      source: quote.source,
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
 * Fechamentos oficiais do pregão, ou `undefined` para recorrer à cadeia de
 * provedores: sem arquivo (fim de semana, feriado, atraso da B3) ou com a B3
 * fora do ar, a reconciliação de antes continua valendo.
 */
async function loadOfficialCloses(
  date: string,
): Promise<Map<string, CotahistQuote> | undefined> {
  try {
    const official = await fetchCotahistClosingPrices(date);
    if (!official) logWarn('reconcileQuotes.cotahistUnavailable', { date });
    return official;
  } catch (error) {
    logWarn('reconcileQuotes.cotahistFailed', {
      date,
      message: (error as Error).message,
    });
    return undefined;
  }
}

/** O fechamento oficial vale sobre qualquer leitura do dia; igual, não regrava. */
function officialCorrections(
  official: Map<string, CotahistQuote>,
  tickerList: string[],
  stored: Map<string, Quote>,
): [string, Correction][] {
  const missing = tickerList.filter((ticker) => !official.has(ticker));
  if (missing.length > 0) {
    logWarn('reconcileQuotes.tickersWithoutClose', { tickers: missing });
  }
  return tickerList.flatMap((ticker): [string, Correction][] => {
    const close = official.get(ticker);
    if (!close || stored.get(ticker)?.price === close.price) return [];
    return [[ticker, { price: close.price, source: OFFICIAL_SOURCE }]];
  });
}

async function providerCorrections(
  tickerList: string[],
  stored: Map<string, Quote>,
): Promise<[string, Correction][]> {
  const quotes = await fetchCatalogQuotes(tickerList, 'reconcileQuotes');
  return [...quotes.entries()].filter(([ticker, quote]) =>
    isNewerQuote(quote, stored.get(ticker)),
  );
}

/**
 * Reconciliação noturna do preço de fechamento (issue #389).
 *
 * Mesmo depois de atrasar a cadeia diária para depois do after-market (#388),
 * não há garantia de que a fonte já consolidou o fechamento: a Brapi chegou a
 * servir o último negócio do pregão contínuo mais de uma hora depois do
 * encerramento. Este job volta mais tarde e corrige **apenas o preço**.
 *
 * Reexecutar o `updateAllQuotes` não serviria: ele também registra proventos
 * e tira a foto de data-com, varrendo todos os usuários. O registro é
 * idempotente, mas a varredura extra custa leituras sem necessidade.
 *
 * A fonte é o COTAHIST da B3 (#600), que traz o preço oficial do leilão de
 * fechamento e é publicado antes deste job. Sem o arquivo do pregão, recorre
 * à cadeia de provedores e só sobrescreve quando a fonte apurou depois do que
 * está gravado.
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

    const stored = await getQuotesByTicker(tickerList);
    const official = await loadOfficialCloses(today());
    const entries = official
      ? officialCorrections(official, tickerList, stored)
      : await providerCorrections(tickerList, stored);

    let reconciled = 0;
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
