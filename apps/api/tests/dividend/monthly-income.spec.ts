import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';
import { computeMonthlyIncome } from '../../src/dividend/monthly-income.service';
import { Position, Quote, FridgeItem } from 'dindin-models';
import { UserSubscription } from 'dindin-shared-types';

interface TestFridge {
  id: string;
  items: FridgeItem[];
}

function createFirestoreMock(
  positions: Position[] = [],
  quotes: Quote[] = [],
  fridges: TestFridge[] = [],
  subscription: Partial<UserSubscription> | null = null,
) {
  const quoteByTicker = new Map(
    quotes.map((quote) => [quote.ticker.toUpperCase(), quote]),
  );

  return {
    // As cotações passaram a ser buscadas por ticker, com getAll, em vez de
    // varrer a coleção inteira (issue #299).
    getAll: jest.fn(async (...refs: { id: string }[]) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: quoteByTicker.has(ref.id),
        data: () => quoteByTicker.get(ref.id),
      })),
    ),
    collection: jest.fn((path: string) => {
      if (path === 'quotes') {
        return { doc: jest.fn((ticker: string) => ({ id: ticker })) };
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
                // A leitura passou a sair de `fridgeItemsCollection(uid,
                // fridgeId)` em vez de `fridgeDoc.ref.collection(...)` —
                // mesmo caminho, montado pelo módulo de paths (issue #302).
                const itemsOf = (fridgeId: string) => ({
                  get: jest.fn().mockResolvedValue({
                    docs: (
                      fridges.find((fridge) => fridge.id === fridgeId)?.items ??
                      []
                    ).map((item) => ({
                      id: item.id,
                      data: () => ({ ...item }),
                    })),
                  }),
                });

                return {
                  doc: jest.fn((fridgeId: string) => ({
                    collection: jest.fn((innerPath: string) => {
                      if (innerPath === 'fridgeItems') return itemsOf(fridgeId);
                      throw new Error(
                        `Unexpected inner collection: ${innerPath}`,
                      );
                    }),
                  })),
                  get: jest.fn().mockResolvedValue({
                    docs: fridges.map((fridge) => ({
                      id: fridge.id,
                      data: () => ({ name: fridge.id }),
                    })),
                  }),
                };
              }
              if (subPath === 'billing') {
                return {
                  doc: jest.fn(() => ({
                    get: jest
                      .fn()
                      .mockResolvedValue(
                        subscription
                          ? { exists: true, data: () => subscription }
                          : { exists: false },
                      ),
                  })),
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

  it('deve calcular renda mensal no serviço incluindo a geladeira', async () => {
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

    await expect(
      computeMonthlyIncome('user-123', 'wallet-1'),
    ).resolves.toMatchObject({
      total: 22,
      totalFromFridge: 13,
      monthlyDividendByTicker: new Map([
        ['HGLG11', 0.9],
        ['XPLG11', 0.65],
      ]),
    });
  });

  it('deve projetar pelo último provento da Brapi, não pela média de 12 meses (#290)', async () => {
    const position = (id: string, ticker: string, quantity: number) => ({
      id,
      walletId: 'wallet-1',
      ticker,
      assetType: 'STOCK' as const,
      quantity,
      averagePrice: 10,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const positions: Position[] = [
      position('position-1', 'PETR4', 100),
      position('position-2', 'HGLG11', 10),
    ];
    const quotes: Quote[] = [
      {
        ticker: 'PETR4',
        price: 38,
        monthlyDividend: 1.2,
        dividendPaymentDate: '2026-08-20',
        annualDividend: 2.4,
        updatedAt: '2026-09-18T00:00:00Z',
        source: 'brapi',
      },
      {
        ticker: 'HGLG11',
        price: 112,
        monthlyDividend: 0.9,
        updatedAt: '2026-09-18T00:00:00Z',
        source: 'brapi',
      },
      {
        ticker: 'TRXF11',
        price: 100,
        monthlyDividend: 0.93,
        annualDividend: 11.8,
        updatedAt: '2026-09-18T00:00:00Z',
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
            ticker: 'TRXF11',
            quantity: 51,
            transferredPrice: 100,
            targetPrice: 110,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    ];
    firestoreMock = createFirestoreMock(positions, quotes, fridges);

    const income = await computeMonthlyIncome('user-123', 'wallet-1');

    // PETR4 1.2 × 100 = 120; HGLG11 0.9 × 10 = 9; TRXF11 0.93 × 51 = 47,43.
    // Pela média de 12 meses a geladeira daria 11.8 / 12 × 51 = 50,15.
    expect(income.totalFromFridge).toBe(47.43);
    expect(income.total).toBe(176.43);
    expect(income.byTicker).toContainEqual({
      ticker: 'PETR4',
      quantity: 100,
      monthlyDividend: 1.2,
      monthlyIncome: 120,
      paymentDate: '2026-08-20',
    });
    // Nem a sugestão por IA recebe a média de 12 meses: vale o último
    // provento, inclusive de quem só está na geladeira.
    expect(income).not.toHaveProperty('averageMonthlyDividendByTicker');
    expect(income.monthlyDividendByTicker).toEqual(
      new Map([
        ['PETR4', 1.2],
        ['HGLG11', 0.9],
        ['TRXF11', 0.93],
      ]),
    );
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

  it('deve incluir a data de pagamento do provento em cada ticker', async () => {
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
        dividendPaymentDate: '2026-09-15',
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
        paymentDate: '2026-09-15',
      },
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.07,
        monthlyIncome: 7,
      },
    ]);
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

// ---------------------------------------------------------------------------
// Recorte gratuito da projeção e da agenda (issue #262)
// ---------------------------------------------------------------------------

describe('GET /api/wallets/:walletId/monthly-income – plano gratuito (#262)', () => {
  const token = 'valid-token';
  const MS_PER_DAY = 86400000;

  function isoDate(offsetDays: number): string {
    return new Date(Date.now() + offsetDays * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
  }

  const SCENARIO: { ticker: string; income: number; offset: number }[] = [
    { ticker: 'AAAA11', income: 5, offset: -10 },
    { ticker: 'BBBB11', income: 45, offset: -3 },
    { ticker: 'CCCC11', income: 39.1, offset: 1 },
    { ticker: 'DDDD11', income: 26.1, offset: -3 },
    { ticker: 'EEEE11', income: 9, offset: 30 },
  ];

  const positions: Position[] = SCENARIO.map(({ ticker }, index) => ({
    id: `position-${index}`,
    walletId: 'wallet-1',
    ticker,
    assetType: 'FII',
    quantity: 10,
    averagePrice: 100,
    inFridge: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }));

  const quotes: Quote[] = SCENARIO.map(({ ticker, income, offset }) => ({
    ticker,
    price: 100,
    monthlyDividend: income / 10,
    dividendPaymentDate: isoDate(offset),
    updatedAt: '2026-09-01T00:00:00Z',
    source: 'brapi',
  }));

  const ACTIVE_SUBSCRIPTION: Partial<UserSubscription> = {
    status: 'active',
    plan: 'basic',
    interval: 'month',
    provider: 'stripe',
    providerSubscriptionId: 'sub_1',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: '2026-09-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function get() {
    return request(app)
      .get('/api/wallets/wallet-1/monthly-income')
      .set('Authorization', `Bearer ${token}`);
  }

  it('deve limitar a projeção aos 3 ativos de maior renda sem assinatura', async () => {
    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body.limited).toBe(true);
    expect(response.body.byTicker.map((i: any) => i.ticker)).toEqual([
      'BBBB11',
      'CCCC11',
      'DDDD11',
    ]);
    expect(response.body.hiddenTickers).toEqual(['AAAA11', 'EEEE11']);
    // Os ocultos entram só como nome: nenhuma projeção deles no payload.
    const detailed = [
      ...response.body.byTicker,
      ...response.body.scheduleItems,
    ];
    expect(
      detailed.some((i: any) => i.ticker === 'AAAA11' || i.ticker === 'EEEE11'),
    ).toBe(false);
  });

  it('deve limitar a agenda às 2 datas mais próximas de hoje sem assinatura', async () => {
    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await get();

    expect(response.body.scheduleItems.map((i: any) => i.ticker)).toEqual([
      'BBBB11',
      'CCCC11',
      'DDDD11',
    ]);
    expect(response.body.hiddenPaymentDates).toEqual([
      isoDate(-10),
      isoDate(30),
    ]);
  });

  it('deve manter totais completos para quem não assina', async () => {
    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await get();

    expect(response.body.total).toBe(124.2);
    expect(response.body.totalFromFridge).toBe(0);
    expect(response.body.scheduleTotals).toEqual({
      paidTotal: 76.1,
      upcomingTotal: 48.1,
    });
  });

  it('deve devolver tudo para quem assina', async () => {
    firestoreMock = createFirestoreMock(
      positions,
      quotes,
      [],
      ACTIVE_SUBSCRIPTION,
    );

    const response = await get();

    expect(response.body.limited).toBe(false);
    expect(response.body.byTicker).toHaveLength(5);
    expect(response.body.scheduleItems).toBeUndefined();
    expect(response.body.hiddenTickers).toEqual([]);
    expect(response.body.hiddenPaymentDates).toEqual([]);
    expect(response.body.total).toBe(124.2);
  });

  it('deve devolver tudo para admin sem assinatura', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123', admin: true });
    firestoreMock = createFirestoreMock(positions, quotes, []);

    const response = await get();

    expect(response.body.limited).toBe(false);
    expect(response.body.byTicker).toHaveLength(5);
  });

  it('não deve marcar limited quando tudo cabe no recorte gratuito', async () => {
    firestoreMock = createFirestoreMock(
      positions.slice(1, 4),
      quotes.slice(1, 4),
      [],
    );

    const response = await get();

    expect(response.body.limited).toBe(true);
    expect(response.body.hiddenTickers).toEqual([]);
    expect(response.body.hiddenPaymentDates).toEqual([]);
    expect(response.body.byTicker).toHaveLength(3);
  });
});
