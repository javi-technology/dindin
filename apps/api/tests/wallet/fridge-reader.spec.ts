const fridgesCollectionMock = jest.fn();
const fridgeItemsCollectionMock = jest.fn();

jest.mock('../../src/firestore/paths', () => ({
  fridgesCollection: (...args: unknown[]) => fridgesCollectionMock(...args),
  fridgeItemsCollection: (...args: unknown[]) =>
    fridgeItemsCollectionMock(...args),
}));

import {
  getAllUserFridgeItems,
  getAllUserFridgeItemsWithFridge,
} from '../../src/wallet/fridge-reader';

// ---------------------------------------------------------------------------
// Leitura dos itens da geladeira, num lugar só (issue #302)
//
// `fetchFridgeItems` existia em `monthly-income`, `patrimony-snapshot` e
// `target-price`, com resultados diferentes: as duas primeiras devolviam só o
// item, a terceira carregava junto o nome da geladeira para o e-mail de
// alerta. Uma correção numa delas não alcançava as outras.
// ---------------------------------------------------------------------------

function snapshot(docs: { id: string; data: unknown }[]) {
  return { docs: docs.map(({ id, data }) => ({ id, data: () => data })) };
}

function setupFridges(
  fridges: { id: string; name?: string }[],
  itemsByFridge: Record<string, { id: string; data: unknown }[]>,
) {
  fridgesCollectionMock.mockReturnValue({
    get: jest
      .fn()
      .mockResolvedValue(
        snapshot(fridges.map(({ id, name }) => ({ id, data: { name } }))),
      ),
  });
  fridgeItemsCollectionMock.mockImplementation(
    (_userId: string, fridgeId: string) => ({
      get: jest.fn().mockResolvedValue(snapshot(itemsByFridge[fridgeId] ?? [])),
    }),
  );
}

describe('wallet/fridge-reader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve juntar os itens de todas as geladeiras do usuário', async () => {
    setupFridges([{ id: 'fridge-1' }, { id: 'fridge-2' }], {
      'fridge-1': [{ id: 'item-1', data: { ticker: 'HGLG11', quantity: 5 } }],
      'fridge-2': [{ id: 'item-2', data: { ticker: 'XPML11', quantity: 3 } }],
    });

    const items = await getAllUserFridgeItems('user-123');

    expect(items).toEqual([
      { id: 'item-1', ticker: 'HGLG11', quantity: 5 },
      { id: 'item-2', ticker: 'XPML11', quantity: 3 },
    ]);
  });

  it('deve devolver lista vazia para usuário sem geladeira', async () => {
    setupFridges([], {});

    expect(await getAllUserFridgeItems('user-123')).toEqual([]);
  });

  it('deve carregar o id e o nome da geladeira de cada item', async () => {
    setupFridges([{ id: 'fridge-1', name: 'Geladeira Principal' }], {
      'fridge-1': [{ id: 'item-1', data: { ticker: 'HGLG11', quantity: 5 } }],
    });

    const items = await getAllUserFridgeItemsWithFridge('user-123');

    expect(items).toEqual([
      {
        item: { id: 'item-1', ticker: 'HGLG11', quantity: 5 },
        fridgeId: 'fridge-1',
        fridgeName: 'Geladeira Principal',
      },
    ]);
  });

  // O e-mail de alerta usa o nome; geladeira antiga pode não ter o campo.
  it('deve usar nome vazio quando a geladeira não tem nome', async () => {
    setupFridges([{ id: 'fridge-1' }], {
      'fridge-1': [{ id: 'item-1', data: { ticker: 'HGLG11' } }],
    });

    const [entry] = await getAllUserFridgeItemsWithFridge('user-123');

    expect(entry.fridgeName).toBe('');
  });
});
