import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
  firestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';
import { Position, Quote, Fridge, FridgeItem } from 'dindin-models';

interface TestFridge {
  id: string;
  items: FridgeItem[];
}

function createFirestoreMock(
  positions: Position[] = [],
  quotes: Quote[] = [],
  fridges: TestFridge[] = [],
) {
  return {
    collection: jest.fn((path: string) => {
      if (path === 'quotes') {
        return {
          get: jest.fn().mockResolvedValue({
            docs: quotes.map((quote) => ({
              id: quote.ticker,
              data: () => ({ ...quote }),
            })),
          }),
        };
      }
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets' && uid === 'user-123') {
                return {
                  doc: jest.fn(() => ({
                    collection: jest.fn((innerPath: string) => {
                      if (innerPath === 'positions') {
                        return {
                          get: jest.fn().mockResolvedValue({
                            docs: positions.map((position) => ({
                              id: position.id,
                              data: () => ({ ...position }),
                            })),
                          }),
                        };
                      }
                      throw new Error(
                        `Unexpected inner collection: ${innerPath}`,
                      );
                    }),
                  })),
                };
              }
              if (subPath === 'fridges' && uid === 'user-123') {
                return {
                  get: jest.fn().mockResolvedValue({
                    docs: fridges.map((fridge) => ({
                      id: fridge.id,
                      ref: {
                        collection: jest.fn((innerPath: string) => {
                          if (innerPath === 'fridgeItems') {
                            return {
                              get: jest.fn().mockResolvedValue({
                                docs: fridge.items.map((item) => ({
                                  id: item.id,
                                  data: () => ({ ...item }),
                                })),
                              }),
                            };
                          }
                          throw new Error(
                            `Unexpected inner collection: ${innerPath}`,
                          );
                        }),
                      },
                    })),
                  }),
                };
              }
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }),
          })),
        };
      }
      throw new Error(`Unexpected collection: ${path}`);
    }),
  };
}

describe('GET /api/wallets/:walletId/monthly-income', () => {
  const token = 'valid-token';

  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve calcular renda mensal por ticker com base nas quotes', async () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        walletId: 'wallet-1',
        ticker: 'HGLG11',
        assetType: 'FII',
        quantity: 10,
        averagePrice: 110,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'position-2',
        walletId: 'wallet-1',
        ticker: 'MXRF11',
        assetType: 'FII',
        quantity: 100,
        averagePrice: 10,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const quotes: Quote[] = [
      {
        ticker: 'HGLG11',
        price: 112,
        monthlyDividend: 0.9,
        updatedAt: '2026-08-25T00:00:00Z',
        source: 'brapi',
      },
      {
        ticker: 'MXRF11',
        price: 10.5,
        monthlyDividend: 0.07,
        updatedAt: '2026-08-25T00:00:00Z',
        source: 'brapi',
      },
    ];

    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await request(app)
      .get('/api/wallets/wallet-1/monthly-income')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.byTicker).toEqual([
      {
        ticker: 'HGLG11',
        quantity: 10,
        monthlyDividend: 0.9,
        monthlyIncome: 9,
      },
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.07,
        monthlyIncome: 7,
      },
    ]);
    expect(response.body.total).toBe(16);
    expect(response.body.totalFromFridge).toBe(0);
  });

  it('deve somar proventos da geladeira no total', async () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        walletId: 'wallet-1',
        ticker: 'HGLG11',
        assetType: 'FII',
        quantity: 10,
        averagePrice: 110,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const quotes: Quote[] = [
      {
        ticker: 'HGLG11',
        price: 112,
        monthlyDividend: 0.9,
        updatedAt: '2026-08-25T00:00:00Z',
        source: 'brapi',
      },
      {
        ticker: 'XPLG11',
        price: 95,
        monthlyDividend: 0.65,
        updatedAt: '2026-08-25T00:00:00Z',
        source: 'brapi',
      },
    ];

    const fridges: TestFridge[] = [
      {
        id: 'fridge-1',
        items: [
          {
            id: 'item-1',
            fridgeId: 'fridge-1',
            ticker: 'XPLG11',
            quantity: 20,
            transferredPrice: 90,
            targetPrice: 100,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    ];

    firestoreMock = createFirestoreMock(positions, quotes, fridges);

    const response = await request(app)
      .get('/api/wallets/wallet-1/monthly-income')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(22);
    expect(response.body.totalFromFridge).toBe(13);
  });

  it('deve retornar 0 para tickers sem cotação', async () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        walletId: 'wallet-1',
        ticker: 'NOVO11',
        assetType: 'FII',
        quantity: 10,
        averagePrice: 10,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    firestoreMock = createFirestoreMock(positions, []);

    const response = await request(app)
      .get('/api/wallets/wallet-1/monthly-income')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.byTicker[0].monthlyIncome).toBe(0);
    expect(response.body.total).toBe(0);
  });

  it('deve ignorar posições com quantidade inválida', async () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        walletId: 'wallet-1',
        ticker: 'HGLG11',
        assetType: 'FII',
        quantity: NaN,
        averagePrice: 110,
        inFridge: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const quotes: Quote[] = [
      {
        ticker: 'HGLG11',
        price: 112,
        monthlyDividend: 0.9,
        updatedAt: '2026-08-25T00:00:00Z',
        source: 'brapi',
      },
    ];

    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await request(app)
      .get('/api/wallets/wallet-1/monthly-income')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.byTicker[0].monthlyIncome).toBe(0);
    expect(response.body.total).toBe(0);
  });
});
