let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

import {
  computeUserPatrimony,
  listPatrimonySnapshots,
  saveAllPatrimonySnapshots,
  savePatrimonySnapshot,
} from '../../src/patrimony/patrimony-snapshot.service';

function firestoreDocument(
  id: string,
  data: Record<string, unknown>,
  ref?: Record<string, unknown>,
) {
  return { id, data: () => data, ...(ref ? { ref } : {}) };
}

function userDataFirestore(options: {
  quotes?: Record<string, number>[];
  positions?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  snapshotSet?: jest.Mock;
}) {
  const positionsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: options.positions ?? [],
    }),
  };
  const walletsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'wallet-1',
          ref: {
            collection: jest.fn(() => positionsCollection),
          },
        },
      ],
    }),
  };
  const itemsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: options.items ?? [],
    }),
  };
  const fridgesCollection = {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'fridge-1',
          ref: {
            collection: jest.fn(() => itemsCollection),
          },
        },
      ],
    }),
  };
  const snapshotsCollection = {
    doc: jest.fn(() => ({
      set: options.snapshotSet ?? jest.fn().mockResolvedValue(undefined),
    })),
  };
  const userDoc = {
    collection: jest.fn((name: string) => {
      if (name === 'wallets') return walletsCollection;
      if (name === 'fridges') return fridgesCollection;
      if (name === 'patrimonySnapshots') return snapshotsCollection;
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name === 'quotes') {
        return {
          get: jest.fn().mockResolvedValue({
            docs: (options.quotes ?? []).map((quote) =>
              firestoreDocument(quote.ticker.toLowerCase(), quote),
            ),
          }),
        };
      }
      if (name === 'users') {
        return { doc: jest.fn(() => userDoc) };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  return { positionsCollection, snapshotsCollection, userDoc };
}

describe('PatrimonySnapshotService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve usar cotação atual e fallback de preço médio ou transferido', async () => {
    userDataFirestore({
      quotes: [{ ticker: 'HGLG11', price: 120 }],
      positions: [
        firestoreDocument('position-1', {
          ticker: 'HGLG11',
          quantity: 2,
          averagePrice: 100,
        }),
        firestoreDocument('position-2', {
          ticker: 'MXRF11',
          quantity: 3,
          averagePrice: 10,
        }),
      ],
      items: [
        firestoreDocument('item-1', {
          ticker: 'HGLG11',
          quantity: 1,
          transferredPrice: 90,
        }),
        firestoreDocument('item-2', {
          ticker: 'MXRF11',
          quantity: 2,
          transferredPrice: 8,
        }),
      ],
    });

    await expect(computeUserPatrimony('user-1')).resolves.toEqual({
      totalWallet: 270,
      totalFridge: 136,
      total: 406,
    });
  });

  it('deve ignorar quantidades não finitas ou negativas', async () => {
    userDataFirestore({
      positions: [
        firestoreDocument('position-1', {
          ticker: 'HGLG11',
          quantity: NaN,
          averagePrice: 100,
        }),
        firestoreDocument('position-2', {
          ticker: 'HGLG11',
          quantity: -2,
          averagePrice: 100,
        }),
      ],
      items: [
        firestoreDocument('item-1', {
          ticker: 'HGLG11',
          quantity: Infinity,
          transferredPrice: 90,
        }),
      ],
    });

    await expect(computeUserPatrimony('user-1')).resolves.toEqual({
      totalWallet: 0,
      totalFridge: 0,
      total: 0,
    });
  });

  it('deve salvar o snapshot com o id igual à data', async () => {
    const snapshotSet = jest.fn().mockResolvedValue(undefined);
    const { snapshotsCollection } = userDataFirestore({
      snapshotSet,
      positions: [],
      items: [],
    });

    const result = await savePatrimonySnapshot('user-1', '2026-08-27');

    expect(snapshotsCollection.doc).toHaveBeenCalledWith('2026-08-27');
    expect(snapshotSet).toHaveBeenCalledWith(result);
    expect(result).toEqual({
      id: '2026-08-27',
      userId: 'user-1',
      date: '2026-08-27',
      totalWallet: 0,
      totalFridge: 0,
      total: 0,
      createdAt: expect.any(String),
    });
  });

  it('deve listar snapshots em ordem crescente de data', async () => {
    const snapshots = [
      firestoreDocument('2026-08-27', {
        userId: 'user-1',
        date: '2026-08-27',
        totalWallet: 120,
        totalFridge: 0,
        total: 120,
        createdAt: '2026-08-27T00:00:00Z',
      }),
      firestoreDocument('2026-08-26', {
        userId: 'user-1',
        date: '2026-08-26',
        totalWallet: 100,
        totalFridge: 0,
        total: 100,
        createdAt: '2026-08-26T00:00:00Z',
      }),
    ];
    const limit = jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ docs: snapshots }),
    }));
    const orderBy = jest.fn(() => ({ limit }));
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({ orderBy })),
        })),
      })),
    };

    await expect(listPatrimonySnapshots('user-1', 30)).resolves.toEqual([
      { id: '2026-08-26', ...snapshots[1].data() },
      { id: '2026-08-27', ...snapshots[0].data() },
    ]);
    expect(orderBy).toHaveBeenCalledWith('date', 'desc');
    expect(limit).toHaveBeenCalledWith(30);
  });

  it('deve usar listDocuments e continuar após falha de um usuário', async () => {
    const set = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('falha no segundo usuário'));
    const usersCollection = {
      listDocuments: jest
        .fn()
        .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      doc: jest.fn(() => ({
        collection: jest.fn((name: string) => {
          if (name === 'patrimonySnapshots') {
            return { doc: jest.fn(() => ({ set })) };
          }
          if (name === 'wallets' || name === 'fridges') {
            return { get: jest.fn().mockResolvedValue({ docs: [] }) };
          }
          throw new Error(`Coleção inesperada: ${name}`);
        }),
      })),
    };
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'users') return usersCollection;
        if (name === 'quotes') {
          return { get: jest.fn().mockResolvedValue({ docs: [] }) };
        }
        throw new Error(`Coleção inesperada: ${name}`);
      }),
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(saveAllPatrimonySnapshots()).resolves.toBeUndefined();

    expect(usersCollection.listDocuments).toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });
});
