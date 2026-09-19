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

  it('deve projetar o total pela média mensal dos proventos de 12 meses', async () => {
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
      // Semestral: o último provento (1.2) não se repete todo mês.
      position('position-1', 'PETR4', 100),
      // Sem soma anual (ainda não sincronizado): mantém o último provento.
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
        ticker: 'ITSA4',
        price: 10,
        monthlyDividend: 0.6,
        annualDividend: 1.2,
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
            ticker: 'ITSA4',
            quantity: 50,
            transferredPrice: 10,
            targetPrice: 12,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    ];
    firestoreMock = createFirestoreMock(positions, quotes, fridges);

    const income = await computeMonthlyIncome('user-123', 'wallet-1');

    // PETR4 2.4/12 × 100 = 20; HGLG11 0.9 × 10 = 9; ITSA4 1.2/12 × 50 = 5.
    expect(income.total).toBe(34);
    expect(income.totalFromFridge).toBe(5);
    // Média por ticker, inclusive de quem só está na geladeira (#279).
    expect(income.averageMonthlyDividendByTicker).toEqual(
      new Map([
        ['PETR4', 0.2],
        ['HGLG11', 0.9],
        ['ITSA4', 0.1],
      ]),
    );
    // A agenda mostra o evento anunciado, não a média.
    expect(income.byTicker).toContainEqual({
      ticker: 'PETR4',
      quantity: 100,
      monthlyDividend: 1.2,
      monthlyIncome: 120,
      averageMonthlyIncome: 20,
      paymentDate: '2026-08-20',
    });
    // A soma das médias por ativo das carteiras bate com o total sem geladeira.
    const averageSum = income.byTicker.reduce(
      (sum, item) => sum + item.averageMonthlyIncome,
      0,
    );
    expect(averageSum).toBe(income.total - income.totalFromFridge);
  });

  it('não deve arredondar a média usada no total do card', async () => {
    firestoreMock = createFirestoreMock(
      [
        {
          id: 'position-1',
          walletId: 'wallet-1',
          ticker: 'ITSA4',
          assetType: 'STOCK',
          quantity: 3,
          averagePrice: 10,
          inFridge: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          ticker: 'ITSA4',
          price: 10,
          monthlyDividend: 0.6,
          annualDividend: 2.3,
          updatedAt: '2026-09-18T00:00:00Z',
          source: 'brapi',
        },
      ],
      [],
    );

    const income = await computeMonthlyIncome('user-123', 'wallet-1');

    // 3 × 2.3 / 12 = 0,575 → R$ 0,57. Com a média arredondada a 6 casas
    // (0,191667) o total viraria R$ 0,58.
    expect(income.total).toBe(0.57);
    // O mapa exposto à sugestão por IA segue arredondado para o prompt.
    expect(income.averageMonthlyDividendByTicker.get('ITSA4')).toBe(0.191667);
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
        averageMonthlyIncome: 9,
      },
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.07,
        monthlyIncome: 7,
        averageMonthlyIncome: 7,
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
        averageMonthlyIncome: 9,
        paymentDate: '2026-09-15',
      },
      {
        ticker: 'MXRF11',
        quantity: 100,
        monthlyDividend: 0.07,
        monthlyIncome: 7,
        averageMonthlyIncome: 7,
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
