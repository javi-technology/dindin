import { FridgeItem, Position, Quote } from 'dindin-models';

let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

import {
  autoDividendId,
  monthKey,
  recordAllMonthlyDividends,
  recordMonthlyDividends,
} from '../../src/dividend/dividend-record.service';

function firestoreDocument(
  id: string,
  data: Record<string, unknown>,
  ref?: Record<string, unknown>,
) {
  return { id, data: () => data, ...(ref ? { ref } : {}) };
}

function setupUserFirestore(options: {
  quotes?: Array<Partial<Quote> & { id?: string }>;
  positions?: Partial<Position>[];
  fridgeItems?: Partial<FridgeItem>[];
  existingDividends?: Array<{
    id: string;
    data: Record<string, unknown>;
  }>;
}) {
  const positionsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: (options.positions ?? []).map((position, index) =>
        firestoreDocument(`position-${index + 1}`, position),
      ),
    }),
  };
  const walletsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'wallet-1',
          ref: { collection: jest.fn(() => positionsCollection) },
        },
      ],
    }),
  };
  const fridgeItemsCollection = {
    get: jest.fn().mockResolvedValue({
      docs: (options.fridgeItems ?? []).map((item, index) =>
        firestoreDocument(`item-${index + 1}`, item),
      ),
    }),
  };
  const fridgesCollection = {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'fridge-1',
          ref: { collection: jest.fn(() => fridgeItemsCollection) },
        },
      ],
    }),
  };
  const existingQuery = {
    where: jest.fn(),
    get: jest.fn().mockResolvedValue({
      docs: (options.existingDividends ?? []).map(({ id, data }) =>
        firestoreDocument(id, data),
      ),
    }),
  };
  existingQuery.where.mockReturnValue(existingQuery);
  const dividendsCollection = {
    doc: jest.fn((id: string) => ({ id })),
    where: jest.fn(() => existingQuery),
  };
  const userDocument = {
    collection: jest.fn((name: string) => {
      if (name === 'wallets') return walletsCollection;
      if (name === 'fridges') return fridgesCollection;
      if (name === 'dividends') return dividendsCollection;
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  const batchSet = jest.fn();
  const batchDelete = jest.fn();
  const batchCommit = jest.fn().mockResolvedValue(undefined);

  firestoreMock = {
    batch: jest.fn(() => ({
      set: batchSet,
      delete: batchDelete,
      commit: batchCommit,
    })),
    collection: jest.fn((name: string) => {
      if (name === 'quotes') {
        return {
          get: jest.fn().mockResolvedValue({
            docs: (options.quotes ?? []).map((quote, index) =>
              firestoreDocument(
                quote.id ?? quote.ticker ?? `quote-${index + 1}`,
                quote,
              ),
            ),
          }),
        };
      }
      if (name === 'users') {
        return { doc: jest.fn(() => userDocument) };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  return { batchSet, batchDelete, batchCommit, dividendsCollection };
}

describe('DividendRecordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gera a chave mensal e ids determinísticos normalizados', () => {
    expect(monthKey('2026-09-15')).toBe('2026-09');
    expect(autoDividendId('2026-09', ' hglg11 ')).toBe('2026-09_HGLG11');
  });

  it('registra um documento por ticker somando posições e itens da geladeira', async () => {
    const { batchSet, batchCommit, dividendsCollection } = setupUserFirestore({
      quotes: [
        { id: 'hglg11', ticker: 'HGLG11', monthlyDividend: 0.923 },
        { id: 'xplg11', ticker: 'XPLG11', monthlyDividend: 0 },
        { id: 'mxrf11', ticker: 'MXRF11', monthlyDividend: 0.5 },
      ],
      positions: [
        { ticker: 'HGLG11', quantity: 100 },
        { ticker: ' hglg11 ', quantity: 25 },
        { ticker: 'XPLG11', quantity: 10 },
        { ticker: 'MXRF11', quantity: 0 },
      ],
      fridgeItems: [
        { ticker: 'HGLG11', quantity: 5 },
        { ticker: 'MXRF11', quantity: Number.NaN },
        { ticker: 'SEMQUOTE11', quantity: 10 },
      ],
    });

    const result = await recordMonthlyDividends('user-1', '2026-09-15');

    expect(result).toEqual([
      {
        id: '2026-09_HGLG11',
        userId: 'user-1',
        ticker: 'HGLG11',
        amountPerShare: 0.923,
        quantity: 130,
        totalAmount: 119.99,
        paymentDate: '2026-09-15',
        source: 'auto',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
    expect(dividendsCollection.doc).toHaveBeenCalledWith('2026-09_HGLG11');
    expect(batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2026-09_HGLG11' }),
      {
        userId: 'user-1',
        ticker: 'HGLG11',
        amountPerShare: 0.923,
        quantity: 130,
        totalAmount: 119.99,
        paymentDate: '2026-09-15',
        source: 'auto',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('remove registros automáticos antigos que não fazem mais parte da carteira', async () => {
    const { batchDelete, batchCommit } = setupUserFirestore({
      quotes: [{ id: 'hglg11', ticker: 'HGLG11', monthlyDividend: 0.9 }],
      positions: [{ ticker: 'HGLG11', quantity: 100 }],
      existingDividends: [
        {
          id: '2026-09_XPLG11',
          data: {
            ticker: 'XPLG11',
            source: 'auto',
            paymentDate: '2026-09-15',
          },
        },
      ],
    });

    await recordMonthlyDividends('user-1', '2026-09-15');

    expect(batchDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2026-09_XPLG11' }),
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('não cria registro automático quando já existe lançamento manual no mês', async () => {
    const { batchSet, batchDelete, batchCommit } = setupUserFirestore({
      quotes: [{ ticker: 'HGLG11', monthlyDividend: 0.9 }],
      positions: [{ ticker: 'HGLG11', quantity: 100 }],
      existingDividends: [
        {
          id: 'manual-1',
          data: {
            ticker: ' hglg11 ',
            source: 'manual',
            paymentDate: '2026-09-15',
          },
        },
      ],
    });

    const result = await recordMonthlyDividends('user-1', '2026-09-15');

    expect(result).toEqual([]);
    expect(batchSet).not.toHaveBeenCalled();
    expect(batchDelete).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('nunca exclui lançamentos manuais ao reconciliar o mês', async () => {
    const { batchDelete, batchCommit } = setupUserFirestore({
      quotes: [{ ticker: 'HGLG11', monthlyDividend: 0.9 }],
      positions: [],
      existingDividends: [
        {
          id: 'manual-1',
          data: {
            ticker: 'HGLG11',
            source: 'manual',
            paymentDate: '2026-09-15',
          },
        },
      ],
    });

    await recordMonthlyDividends('user-1', '2026-09-15');

    expect(batchDelete).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('processa todos os usuários, continua após falha e lança ao final', async () => {
    const userDocuments = [{ id: 'user-1' }, { id: 'user-2' }];
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'users') {
          return {
            listDocuments: jest.fn().mockResolvedValue(userDocuments),
            doc: jest.fn((userId: string) => {
              const emptyQuery = {
                where: jest.fn(),
                get: jest.fn().mockResolvedValue({ docs: [] }),
              };
              emptyQuery.where.mockReturnValue(emptyQuery);
              return {
                collection: jest.fn((name: string) => {
                  if (userId === 'user-2') {
                    throw new Error('falha no usuário');
                  }
                  if (name === 'dividends') {
                    return { where: jest.fn(() => emptyQuery) };
                  }
                  return { get: jest.fn().mockResolvedValue({ docs: [] }) };
                }),
              };
            }),
          };
        }
        if (name === 'quotes') {
          return { get: jest.fn().mockResolvedValue({ docs: [] }) };
        }
        throw new Error(`Coleção inesperada: ${name}`);
      }),
      batch: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      })),
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(recordAllMonthlyDividends()).rejects.toThrow(
      '[recordAllMonthlyDividends] 1 de 2 registro(s) falharam',
    );
    expect(console.error).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });
});
