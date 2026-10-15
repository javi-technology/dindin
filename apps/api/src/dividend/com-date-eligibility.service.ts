import type { MonthlyIncomeItem } from 'dindin-shared-types';
import { dividendSnapshotsCollection } from '../firestore/paths';
import { roundCurrency } from '../shared/numbers';
import type { SnapshotHoldings } from './dividend-sync-record.service';

/**
 * Agenda de proventos pela quantidade da data-com (#562).
 *
 * Quem tem direito ao provento é quem tinha o ativo no fim da data-com, e o
 * registro do pagamento já usa a foto dessa data (#278). A projeção parte da
 * quantidade atual: uma compra feita depois da data-com inflava o "A receber"
 * — e o "Já pagos" — de um pagamento que essas cotas não recebem, e uma venda
 * o reduzia.
 *
 * Com a data-com passada, cada carteira é comparada com a sua quantidade na
 * foto: o pagamento sai dela (`scheduledQuantity` e `scheduledIncome`) e o que
 * foi comprado depois é informado à parte (`quantityAfterComDate`). A
 * comparação é por carteira, e não pelo total do usuário, para que uma compra
 * na geladeira ou em outra carteira não mexa nas posições que não mudaram e
 * para que a soma das carteiras feche com o consolidado. A renda mensal
 * projetada (`monthlyIncome`) não muda: ela olha os meses seguintes.
 *
 * - A data-com de hoje ainda não conta: a foto é tirada às 18h30, depois do
 *   fechamento, e comprar no próprio dia dá direito.
 * - Sem data-com, sem foto ou com foto anterior a esta versão (só o total do
 *   usuário), vale a quantidade atual.
 * - Só entram as carteiras que têm o ativo hoje: a que vendeu tudo depois da
 *   data-com não tem linha na agenda, nem na sua visão nem no consolidado.
 */
export async function applyComDateEligibility(
  items: MonthlyIncomeItem[],
  userId: string,
  comDateByTicker: Map<string, string>,
  /** Quantidade atual por ticker e carteira, das carteiras que os itens cobrem. */
  loadCurrentByWallet: () => Promise<Map<string, Map<string, number>>>,
  today: string,
): Promise<MonthlyIncomeItem[]> {
  const candidates = items.filter((item) => {
    const comDate = comDateByTicker.get(item.ticker);
    return comDate !== undefined && comDate < today;
  });
  if (candidates.length === 0) return items;

  const [currentByWallet, snapshots] = await Promise.all([
    loadCurrentByWallet(),
    Promise.all(
      candidates.map(async (item) => {
        const doc = await dividendSnapshotsCollection(item.ticker)
          .doc(comDateByTicker.get(item.ticker)!)
          .get();
        const holdings = doc.exists
          ? (doc.data()?.holdings as
              Record<string, SnapshotHoldings> | undefined)
          : undefined;
        return [item.ticker, holdings] as const;
      }),
    ),
  ]);
  const holdingsByTicker = new Map(snapshots);

  return items.map((item) => {
    const holdings = holdingsByTicker.get(item.ticker);
    if (!holdings) return item;

    const atComDate = holdings[userId]?.wallets ?? {};
    let scheduledQuantity = 0;
    let quantityAfterComDate = 0;
    for (const [walletId, quantity] of currentByWallet.get(item.ticker) ?? []) {
      const entitled = atComDate[walletId] ?? 0;
      scheduledQuantity += entitled;
      quantityAfterComDate += Math.max(0, quantity - entitled);
    }
    if (scheduledQuantity === item.quantity && quantityAfterComDate === 0) {
      return item;
    }

    return {
      ...item,
      ...(quantityAfterComDate > 0 && { quantityAfterComDate }),
      scheduledQuantity,
      scheduledIncome: roundCurrency(scheduledQuantity * item.monthlyDividend),
    };
  });
}
