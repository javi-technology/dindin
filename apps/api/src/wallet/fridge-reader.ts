import { FridgeItem } from 'dindin-models';
import { fridgeItemsCollection, fridgesCollection } from '../firestore/paths';

/**
 * Leitura dos itens da geladeira do usuário, num lugar só (issue #302).
 *
 * `fetchFridgeItems` existia em `monthly-income`, `patrimony-snapshot` e
 * `target-price`. As duas primeiras devolviam só o item; a terceira carregava
 * junto o nome da geladeira, que o e-mail de alerta usa. Uma correção numa
 * delas não alcançava as outras.
 */

/** Item com a geladeira de origem, para quem precisa exibi-la. */
export interface FridgeItemWithFridge {
  item: FridgeItem;
  fridgeId: string;
  fridgeName: string;
}

export async function getAllUserFridgeItemsWithFridge(
  userId: string,
): Promise<FridgeItemWithFridge[]> {
  const fridgesSnapshot = await fridgesCollection(userId).get();
  const items: FridgeItemWithFridge[] = [];

  for (const fridgeDoc of fridgesSnapshot.docs) {
    const fridgeName = (fridgeDoc.data() as { name?: string }).name ?? '';
    const itemsSnapshot = await fridgeItemsCollection(
      userId,
      fridgeDoc.id,
    ).get();

    for (const itemDoc of itemsSnapshot.docs) {
      items.push({
        item: { id: itemDoc.id, ...itemDoc.data() } as FridgeItem,
        fridgeId: fridgeDoc.id,
        fridgeName,
      });
    }
  }

  return items;
}

export async function getAllUserFridgeItems(
  userId: string,
): Promise<FridgeItem[]> {
  const items = await getAllUserFridgeItemsWithFridge(userId);
  return items.map(({ item }) => item);
}
