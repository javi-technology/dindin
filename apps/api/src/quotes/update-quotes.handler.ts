import * as admin from 'firebase-admin';
import { fetchQuotes, QuoteResult } from './brapi.service';
import { saveQuoteHistory } from './quote-history.service';

interface QuoteUpdateResult {
  ticker: string;
  positionsUpdated: number;
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

async function processTickerQuote(
  ticker: string,
  quote: QuoteResult,
): Promise<QuoteUpdateResult> {
  try {
    const positionsUpdated = await updatePositionsForTicker(
      ticker,
      quote.price,
    );
    await saveQuoteHistory(ticker, quote.price, 'brapi');

    console.log(
      `[updateAllQuotes] ${ticker}: ${positionsUpdated} posição(ões) atualizada(s) para R$ ${quote.price}.`,
    );

    return { ticker, positionsUpdated };
  } catch (error) {
    console.error(`[updateAllQuotes] Erro ao atualizar ${ticker}:`, {
      message: (error as Error).message,
    });
    return { ticker, positionsUpdated: 0 };
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

    const results: QuoteUpdateResult[] = [];
    for (const [ticker, quote] of quotes) {
      const result = await processTickerQuote(ticker, quote);
      results.push(result);
    }

    const totalUpdated = results.reduce(
      (sum, r) => sum + r.positionsUpdated,
      0,
    );
    console.log(
      `[updateAllQuotes] Concluído. ${quotes.size} ticker(s) atualizado(s), ${totalUpdated} posição(ões) afetada(s).`,
    );
  } catch (error) {
    console.error('[updateAllQuotes] error:', {
      message: (error as Error).message,
    });
  }
}
