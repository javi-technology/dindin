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
  dividendSet?: jest.Mock;
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
  const dividendSet =
    options.dividendSet ?? jest.fn().mockResolvedValue(undefined);
  const dividendsCollection = {
    doc: jest.fn(() => ({ set: dividendSet })),
  };
  const userDocument = {
    collection: jest.fn((name: string) => {
      if (name === 'wallets') return walletsCollection;
      if (name === 'fridges') return fridgesCollection;
      if (name === 'dividends') return dividendsCollection;
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  firestoreMock = {
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

  return { dividendSet, dividendsCollection };
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
    const dividendSet = jest.fn().mockResolvedValue(undefined);
    const { dividendsCollection } = setupUserFirestore({
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
      dividendSet,
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
    expect(dividendSet).toHaveBeenCalledWith({
      userId: 'user-1',
      ticker: 'HGLG11',
      amountPerShare: 0.923,
      quantity: 130,
      totalAmount: 119.99,
      paymentDate: '2026-09-15',
      source: 'auto',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('processa todos os usuários, continua após falha e lança ao final', async () => {
    const userDocuments = [{ id: 'user-1' }, { id: 'user-2' }];
    firestoreMock = {
      collection: jest.fn((name: string) => {
        if (name === 'users') {
          return {
            listDocuments: jest.fn().mockResolvedValue(userDocuments),
            doc: jest.fn((userId: string) => ({
              collection: jest.fn(() => {
                if (userId === 'user-2') {
                  throw new Error('falha no usuário');
                }
                return {
                  get: jest.fn().mockResolvedValue({ docs: [] }),
                };
              }),
            })),
          };
        }
        if (name === 'quotes') {
          return { get: jest.fn().mockResolvedValue({ docs: [] }) };
        }
        throw new Error(`Coleção inesperada: ${name}`);
      }),
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
