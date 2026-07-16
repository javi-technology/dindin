import * as admin from 'firebase-admin';
import { fetchQuotes, QuoteResult } from './brapi.service';
import { saveQuoteHistory } from './quote-history.service';

interface QuoteUpdateResult {
  ticker: string;
  positionsUpdated: number;
  fridgeItemsUpdated: number;
}

async function updatePositionsForTicker(
  ticker: string,
  price: number,
): Promise<number> {
  const positionsForTicker = await admin
    .firestore()
    .collectionGroup('positions')
    .where('ticker', '==', ticker)
    .get();

  const batch = admin.firestore().batch();
  const now = new Date().toISOString();

  for (const doc of positionsForTicker.docs) {
    batch.update(doc.ref, {
      currentPrice: price,
      updatedAt: now,
    });
  }

  await batch.commit();
  return positionsForTicker.docs.length;
}

async function updateFridgeItemsForTicker(
  ticker: string,
  price: number,
): Promise<number> {
  const itemsForTicker = await admin
    .firestore()
    .collectionGroup('fridgeItems')
    .where('ticker', '==', ticker)
    .get();

  if (itemsForTicker.docs.length === 0) {
    return 0;
  }

  const batch = admin.firestore().batch();
  const now = new Date().toISOString();

  for (const doc of itemsForTicker.docs) {
    batch.update(doc.ref, {
      currentPrice: price,
      updatedAt: now,
    });
  }

  await batch.commit();
  return itemsForTicker.docs.length;
}

async function processTickerQuote(
  ticker: string,
  quote: QuoteResult,
): Promise<QuoteUpdateResult> {
  try {
    const [positionsUpdated, fridgeItemsUpdated] = await Promise.all([
      updatePositionsForTicker(ticker, quote.price),
      updateFridgeItemsForTicker(ticker, quote.price),
    ]);
    await saveQuoteHistory(ticker, quote.price, 'brapi');

    console.log(
      `[updateAllQuotes] ${ticker}: ${positionsUpdated} posição(ões) e ${fridgeItemsUpdated} item(ns) na geladeira atualizado(s) para R$ ${quote.price}.`,
    );

    return { ticker, positionsUpdated, fridgeItemsUpdated };
  } catch (error) {
    console.error(`[updateAllQuotes] Erro ao atualizar ${ticker}:`, {
      message: (error as Error).message,
    });
    return { ticker, positionsUpdated: 0, fridgeItemsUpdated: 0 };
  }
}

export async function updateAllQuotes(): Promise<void> {
  try {
    const positionsSnapshot = await admin
      .firestore()
      .collectionGroup('positions')
      .get();

    if (positionsSnapshot.docs.length === 0) {
      console.log('[updateAllQuotes] Nenhuma posição encontrada.');
      return;
    }

    const tickers = new Set<string>();
    for (const doc of positionsSnapshot.docs) {
      const data = doc.data();
      if (data.ticker) {
        tickers.add(data.ticker);
      }
    }

    if (tickers.size === 0) {
      console.log('[updateAllQuotes] Nenhum ticker encontrado.');
      return;
    }

    const tickerList = [...tickers];
    console.log(
      `[updateAllQuotes] Buscando cotações para ${tickerList.length} ticker(s).`,
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

    const tickerEntries = [...quotes.entries()];
    const results: QuoteUpdateResult[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < tickerEntries.length; i += BATCH_SIZE) {
      const batch = tickerEntries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(([ticker, quote]) => processTickerQuote(ticker, quote)),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('[updateAllQuotes] Erro em lote de tickers:', {
            message: result.reason?.message ?? String(result.reason),
          });
        }
      }
    }

    const totalPositionsUpdated = results.reduce(
      (sum, r) => sum + r.positionsUpdated,
      0,
    );
    const totalFridgeUpdated = results.reduce(
      (sum, r) => sum + r.fridgeItemsUpdated,
      0,
    );
    console.log(
      `[updateAllQuotes] Concluído. ${quotes.size} ticker(s) atualizado(s), ${totalPositionsUpdated} posição(ões) e ${totalFridgeUpdated} item(ns) na geladeira afetado(s).`,
    );
  } catch (error) {
    console.error('[updateAllQuotes] error:', {
      message: (error as Error).message,
    });
    throw error;
  }
}
