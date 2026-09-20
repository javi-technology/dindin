/**
 * Backfill da subcoleção `quotes/{ticker}/dividendHistory` (issue #255).
 *
 * A partir de #255 o job de cotações mantém um documento por mês com o
 * provento por cota. Este script popula os meses anteriores a partir dos
 * snapshots diários já existentes em `quotes/{ticker}/history`, para que o
 * gráfico da tela de Proventos não nasça vazio.
 *
 * É idempotente: o id do documento é o mês, então reexecutar sobrescreve com
 * o mesmo conteúdo.
 *
 * Uso (a partir da raiz do repositório):
 *   GOOGLE_APPLICATION_CREDENTIALS=<caminho-da-service-account> \
 *     npm run backfill:dividend-history --workspace=apps/api
 *
 * Para validar em um ativo antes de rodar em todos, defina BACKFILL_TICKER:
 *   BACKFILL_TICKER=HGLG11 npm run backfill:dividend-history --workspace=apps/api
 *
 * Em CI, use o workflow manual `.github/workflows/backfill-dividend-history.yml`,
 * que já autentica com a service account do projeto.
 *
 * Requer credenciais com permissão de escrita no Firestore do projeto.
 */
import { initializeApp } from 'firebase-admin/app';
import { quotesCollection } from '../firestore/paths';
import { getFirestore } from 'firebase-admin/firestore';
import {
  backfillTickerDividendHistory,
  resolveTickers,
} from '../quotes/dividend-history-backfill';

async function main(): Promise<void> {
  initializeApp();

  const allTickers = (await quotesCollection().get()).docs.map((doc) => doc.id);

  if (allTickers.length === 0) {
    console.log('[backfill-dividend-history] nenhum ticker em `quotes`.');
    return;
  }

  const tickers = resolveTickers(allTickers, process.env.BACKFILL_TICKER);

  let total = 0;
  for (const ticker of tickers) {
    const months = await backfillTickerDividendHistory(ticker);
    total += months;
    console.log(`[backfill-dividend-history] ${ticker}: ${months} mês(es).`);
  }

  console.log(
    `[backfill-dividend-history] concluído: ${tickers.length} ticker(s), ${total} documento(s).`,
  );
}

main().catch((error) => {
  console.error('[backfill-dividend-history] falhou:', error);
  process.exitCode = 1;
});
