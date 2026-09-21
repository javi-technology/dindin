/**
 * Migração dos dados legados (issue #326).
 *
 * Duas mudanças anteriores deixaram resíduo no banco:
 *
 * 1. `currentPrice` gravado em cada posição e item. A #86 passou a resolver o
 *    preço a partir de `quotes` na leitura, mas o campo antigo continuou lá,
 *    congelado no valor do dia em que a denormalização parou.
 * 2. Proventos automáticos com o id do job mensal antigo (`YYYY-MM_TICKER`),
 *    enquanto o sync atual usa `YYYY-MM-DD_TICKER`. Enquanto existirem, o
 *    `dividend-sync-record` precisa do tratamento especial `LEGACY_AUTO_ID`.
 *
 * O script **simula por padrão**: só escreve com `--apply`. É idempotente —
 * rodar de novo não faz nada, porque procura exatamente o que ainda não foi
 * migrado.
 *
 *   npm run migrate:legacy --workspace=apps/api            # simula
 *   npm run migrate:legacy --workspace=apps/api -- --apply # aplica
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logError, logInfo } from '../shared/logger';

/** Limite de operações de um batch do Firestore. */
const BATCH_LIMIT = 500;

/** Id do provento gravado pelo job mensal antigo (`YYYY-MM_TICKER`). */
const LEGACY_AUTO_ID = /^\d{4}-\d{2}_/;

interface Options {
  /** `false` (padrão) apenas conta o que seria feito. */
  apply: boolean;
}

export interface CurrentPriceResult {
  positions: number;
  fridgeItems: number;
}

export interface LegacyDividendResult {
  migrated: number;
  /** Já migrados antes, ou sem data de pagamento para derivar o id novo. */
  skipped: number;
}

/** Remove o `currentPrice` denormalizado de posições e itens da geladeira. */
export async function removeLegacyCurrentPrice({
  apply,
}: Options): Promise<CurrentPriceResult> {
  const firestore = getFirestore();
  const result: CurrentPriceResult = { positions: 0, fridgeItems: 0 };

  for (const group of ['positions', 'fridgeItems'] as const) {
    const snapshot = await firestore.collectionGroup(group).get();
    const stale = snapshot.docs.filter(
      (doc) =>
        (doc.data() as { currentPrice?: unknown }).currentPrice !== undefined,
    );

    result[group] = stale.length;

    if (!apply) continue;

    for (let index = 0; index < stale.length; index += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const doc of stale.slice(index, index + BATCH_LIMIT)) {
        batch.update(doc.ref, { currentPrice: FieldValue.delete() });
      }
      await batch.commit();
    }
  }

  return result;
}

/**
 * Regrava os proventos automáticos antigos com o id do formato atual.
 *
 * O id novo sai da data de pagamento, como o sync faz hoje. Quando o destino
 * já existe, só o registro antigo é removido: sobrescrever apagaria o valor
 * que o sync calculou com a quantidade da data-com.
 */
export async function migrateLegacyAutoDividends({
  apply,
}: Options): Promise<LegacyDividendResult> {
  const firestore = getFirestore();
  const snapshot = await firestore.collectionGroup('dividends').get();

  const legacy = snapshot.docs.filter((doc) => {
    const data = doc.data() as { source?: unknown };
    return data.source === 'auto' && LEGACY_AUTO_ID.test(doc.id);
  });

  const result: LegacyDividendResult = { migrated: 0, skipped: 0 };

  for (const doc of legacy) {
    const data = doc.data() as {
      ticker?: unknown;
      paymentDate?: unknown;
    };

    if (
      typeof data.paymentDate !== 'string' ||
      typeof data.ticker !== 'string'
    ) {
      result.skipped += 1;
      continue;
    }

    const target = doc.ref.parent.doc(
      `${data.paymentDate}_${data.ticker.toUpperCase()}`,
    );
    const existing = await target.get();

    if (existing.exists) {
      result.skipped += 1;
    } else {
      result.migrated += 1;
    }

    if (!apply) continue;

    const batch = firestore.batch();
    if (!existing.exists) batch.set(target, doc.data());
    batch.delete(doc.ref);
    await batch.commit();
  }

  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  initializeApp();

  const prices = await removeLegacyCurrentPrice({ apply });
  const dividends = await migrateLegacyAutoDividends({ apply });

  logInfo('migrateLegacyData.done', {
    apply,
    positionsWithCurrentPrice: prices.positions,
    fridgeItemsWithCurrentPrice: prices.fridgeItems,
    dividendsMigrated: dividends.migrated,
    dividendsSkipped: dividends.skipped,
  });

  if (!apply) {
    logInfo('migrateLegacyData.dryRun', {
      hint: 'rode de novo com --apply para gravar',
    });
  }
}

// Só executa quando chamado direto, não quando importado pelos testes.
if (require.main === module) {
  main().catch((error) => {
    logError('migrateLegacyData.failed', {
      message: (error as Error).message,
    });
    process.exitCode = 1;
  });
}
