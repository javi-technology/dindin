import type { MonthlyIncomeItem } from 'dindin-shared-types';
import { dividendSnapshotsCollection } from '../firestore/paths';
import { roundCurrency } from '../shared/numbers';

/**
 * Cotas compradas depois da data-com na agenda de proventos (#562).
 *
 * Quem tem direito ao provento é quem tinha o ativo no fim da data-com, e o
 * registro do pagamento já usa a foto dessa data (#278). A projeção parte da
 * quantidade atual, então uma compra feita depois da data-com inflava o "A
 * receber" — e o "Já pagos" — de um pagamento que essas cotas não recebem.
 *
 * Com a data-com passada, a diferença entre o que o usuário tem hoje e o que
 * a foto guardou sai do pagamento (`scheduledIncome`) e é informada à parte
 * (`quantityAfterComDate`). A renda mensal projetada (`monthlyIncome`) não
 * muda: ela olha os meses seguintes, em que as cotas novas recebem.
 *
 * - A data-com de hoje ainda não conta: a foto é tirada às 18h30, depois do
 *   fechamento, e comprar no próprio dia dá direito.
 * - Sem data-com ou sem foto, vale a quantidade atual, como no registro.
 * - Quem vendeu depois da data-com continua com a quantidade atual: a agenda
 *   pode subestimar, nunca inflar.
 * - A foto é do usuário, não da carteira. A compra é atribuída à carteira até
 *   o que ela tem, de novo para nunca inflar o pagamento.
 */
export async function applyComDateEligibility(
  items: MonthlyIncomeItem[],
  userId: string,
  comDateByTicker: Map<string, string>,
  /** Quantidade atual do usuário por ticker: carteiras e geladeira. */
  loadHeldQuantities: () => Promise<Map<string, number>>,
  today: string,
): Promise<MonthlyIncomeItem[]> {
  const candidates = items.filter((item) => {
    const comDate = comDateByTicker.get(item.ticker);
    return comDate !== undefined && comDate < today;
  });
  if (candidates.length === 0) return items;

  const [held, snapshots] = await Promise.all([
    loadHeldQuantities(),
    Promise.all(
      candidates.map(async (item) => {
        const doc = await dividendSnapshotsCollection(item.ticker)
          .doc(comDateByTicker.get(item.ticker)!)
          .get();
        const quantities = doc.exists
          ? (doc.data()?.quantities as Record<string, number> | undefined)
          : undefined;
        return [item.ticker, quantities] as const;
      }),
    ),
  ]);
  const snapshotByTicker = new Map(snapshots);

  return items.map((item) => {
    const quantities = snapshotByTicker.get(item.ticker);
    if (!quantities) return item;

    const boughtAfter = Math.max(
      0,
      (held.get(item.ticker) ?? 0) - (quantities[userId] ?? 0),
    );
    const quantityAfterComDate = Math.min(item.quantity, boughtAfter);
    if (quantityAfterComDate <= 0) return item;

    return {
      ...item,
      quantityAfterComDate,
      scheduledIncome: roundCurrency(
        (item.quantity - quantityAfterComDate) * item.monthlyDividend,
      ),
    };
  });
}
