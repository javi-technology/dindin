import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';
import { UserSubscription } from 'dindin-shared-types';

// ---------------------------------------------------------------------------
// Renda mensal consolidada (issue #300)
//
// O dashboard e a tela de proventos pediam a renda de cada carteira e somavam
// no cliente. Cada resposta trazia a geladeira inteira, então o front usava
// `Math.max(totalFromFridge)` para não contar duas vezes — heurística que
// vazava detalhe da API — e ainda reaplicava o recorte do plano gratuito.
// ---------------------------------------------------------------------------

interface TestWallet {
  id: string;
  positions: Record<string, unknown>[];
}

function snapshot(docs: { id: string; data: unknown }[]) {
  return { docs: docs.map(({ id, data }) => ({ id, data: () => data })) };
}

function createFirestoreMock(options: {
  wallets?: TestWallet[];
  fridgeItems?: Record<string, unknown>[];
  quotes?: Record<string, unknown>;
  subscription?: Partial<UserSubscription> | null;
  /** Quantidade por carteira e geladeira na foto, por `ticker/comDate` (#562). */
  comDateSnapshots?: Record<
    string,
    Record<string, { wallets: Record<string, number>; fridge?: number }>
  >;
}) {
  const wallets = options.wallets ?? [];
  const quotes = options.quotes ?? {};

  const walletsCollection = {
    get: jest
      .fn()
      .mockResolvedValue(
        snapshot(wallets.map(({ id }) => ({ id, data: { name: id } }))),
      ),
    doc: jest.fn((walletId: string) => ({
      collection: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          snapshot(
            (
              wallets.find((wallet) => wallet.id === walletId)?.positions ?? []
            ).map((position, index) => ({
              id: `${walletId}-position-${index}`,
              data: position,
            })),
          ),
        ),
      })),
    })),
  };

  const fridgeItemsCollection = {
    get: jest.fn().mockResolvedValue(
      snapshot(
        (options.fridgeItems ?? []).map((item, index) => ({
          id: `item-${index}`,
          data: item,
        })),
      ),
    ),
  };

  const fridgesCollection = {
    get: jest
      .fn()
      .mockResolvedValue(
        snapshot([{ id: 'fridge-1', data: { name: 'Geladeira Principal' } }]),
      ),
    doc: jest.fn(() => ({ collection: jest.fn(() => fridgeItemsCollection) })),
  };

  const billingCollection = {
    doc: jest.fn(() => ({
      get: jest
        .fn()
        .mockResolvedValue(
          options.subscription
            ? { exists: true, data: () => options.subscription }
            : { exists: false },
        ),
    })),
  };

  const firestore = {
    walletsCollection,
    fridgesCollection,
    getAll: jest.fn(async (...refs: { id: string }[]) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: quotes[ref.id] !== undefined,
        data: () => quotes[ref.id],
      })),
    ),
    collection: jest.fn((name: string) => {
      if (name === 'quotes') {
        return { doc: jest.fn((ticker: string) => ({ id: ticker })) };
      }
      if (name === 'dividendSync') {
        return {
          doc: jest.fn((ticker: string) => ({
            collection: jest.fn(() => ({
              doc: jest.fn((comDate: string) => ({
                get: jest.fn(async () => {
                  const holdings =
                    options.comDateSnapshots?.[`${ticker}/${comDate}`];
                  return {
                    exists: holdings !== undefined,
                    data: () =>
                      holdings ? { quantities: {}, holdings } : undefined,
                  };
                }),
              })),
            })),
          })),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets') return walletsCollection;
              if (subPath === 'fridges') return fridgesCollection;
              if (subPath === 'billing') return billingCollection;
              throw new Error(`Coleção inesperada: ${subPath}`);
            }),
          })),
        };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
  };

  return firestore;
}

describe('GET /api/monthly-income', () => {
  const authHeader = 'Bearer valid-token';
  const assinante: Partial<UserSubscription> = {
    status: 'active',
    plan: 'basic',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  it('deve somar as posições de todas as carteiras', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'HGLG11', quantity: 10 }] },
        { id: 'wallet-2', positions: [{ ticker: 'HGLG11', quantity: 5 }] },
      ],
      quotes: { HGLG11: { monthlyDividend: 1.1 } },
      subscription: assinante,
    });

    const response = await request(app)
      .get('/api/monthly-income')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    // O mesmo ticker em duas carteiras vira uma linha só.
    expect(response.body.byTicker).toEqual([
      expect.objectContaining({
        ticker: 'HGLG11',
        quantity: 15,
        monthlyIncome: 16.5,
      }),
    ]);
    expect(response.body.total).toBe(16.5);
  });

  // Era a razão do `Math.max(totalFromFridge)` no front: a geladeira é do
  // usuário, não da carteira, e vinha repetida em cada resposta.
  it('deve contar a geladeira uma única vez', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'HGLG11', quantity: 10 }] },
        { id: 'wallet-2', positions: [{ ticker: 'HGLG11', quantity: 10 }] },
      ],
      fridgeItems: [{ ticker: 'XPML11', quantity: 20 }],
      quotes: {
        HGLG11: { monthlyDividend: 1 },
        XPML11: { monthlyDividend: 0.5 },
      },
      subscription: assinante,
    });

    const response = await request(app)
      .get('/api/monthly-income')
      .set('Authorization', authHeader);

    expect(response.body.totalFromFridge).toBe(10);
    expect(response.body.total).toBe(30);
  });

  // Dado importado/antigo pode ter a mesma ação com caixa diferente entre
  // carteiras. A linha consolidada precisa de um ticker estável: o front usa
  // esse valor para pedir o histórico do ativo.
  it('deve normalizar o ticker ao consolidar carteiras', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'PETR4', quantity: 10 }] },
        { id: 'wallet-2', positions: [{ ticker: 'petr4', quantity: 5 }] },
      ],
      quotes: { PETR4: { monthlyDividend: 1 } },
      subscription: assinante,
    });

    const response = await request(app)
      .get('/api/monthly-income')
      .set('Authorization', authHeader);

    expect(response.body.byTicker).toEqual([
      expect.objectContaining({ ticker: 'PETR4', quantity: 15 }),
    ]);
  });

  it('deve devolver zero para usuário sem carteira', async () => {
    firestoreMock = createFirestoreMock({ subscription: assinante });

    const response = await request(app)
      .get('/api/monthly-income')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ byTicker: [], total: 0, totalFromFridge: 0 }),
    );
  });

  // O recorte precisa valer sobre o agregado: aplicado por carteira, duas
  // carteiras mostrariam seis ativos a quem não assina.
  it('deve aplicar o recorte gratuito sobre o consolidado', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        {
          id: 'wallet-1',
          positions: [
            { ticker: 'AAAA11', quantity: 10 },
            { ticker: 'BBBB11', quantity: 10 },
          ],
        },
        {
          id: 'wallet-2',
          positions: [
            { ticker: 'CCCC11', quantity: 10 },
            { ticker: 'DDDD11', quantity: 10 },
          ],
        },
      ],
      quotes: {
        AAAA11: { monthlyDividend: 4 },
        BBBB11: { monthlyDividend: 3 },
        CCCC11: { monthlyDividend: 2 },
        DDDD11: { monthlyDividend: 1 },
      },
      subscription: null,
    });

    const response = await request(app)
      .get('/api/monthly-income')
      .set('Authorization', authHeader);

    expect(response.body.limited).toBe(true);
    expect(response.body.byTicker).toHaveLength(3);
    expect(response.body.hiddenTickers).toEqual(['DDDD11']);
    // Os totais seguem reais, como na rota por carteira.
    expect(response.body.total).toBe(100);
  });

  it('deve retornar 401 sem token', async () => {
    firestoreMock = createFirestoreMock({});

    const response = await request(app).get('/api/monthly-income');

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Agenda pela quantidade da data-com (issue #562)
//
// As datas ficam longe de hoje para o teste não depender do relógio: a
// data-com já passou e o pagamento ainda vai cair.
// ---------------------------------------------------------------------------
describe('agenda e data-com nas rotas de renda', () => {
  const authHeader = 'Bearer valid-token';
  const assinante: Partial<UserSubscription> = {
    status: 'active',
    plan: 'basic',
  };
  const mxrf = {
    monthlyDividend: 0.1,
    dividendPaymentDate: '2999-01-15',
    dividendComDate: '2020-01-10',
  };
  // Na data-com: 10 cotas na carteira 1, nada na 2. Depois, 9 na carteira 2.
  const compraNaCarteira2 = () =>
    createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'MXRF11', quantity: 10 }] },
        { id: 'wallet-2', positions: [{ ticker: 'MXRF11', quantity: 9 }] },
      ],
      quotes: { MXRF11: mxrf },
      subscription: assinante,
      comDateSnapshots: {
        'MXRF11/2020-01-10': { 'user-123': { wallets: { 'wallet-1': 10 } } },
      },
    });
  const renda = (path: string) =>
    request(app).get(path).set('Authorization', authHeader);

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  it('deve tirar do A receber as cotas compradas após a data-com, na visão consolidada', async () => {
    firestoreMock = compraNaCarteira2();

    const response = await renda('/api/monthly-income');

    expect(response.status).toBe(200);
    expect(response.body.byTicker).toEqual([
      expect.objectContaining({
        ticker: 'MXRF11',
        quantity: 19,
        monthlyIncome: 1.9,
        quantityAfterComDate: 9,
        scheduledQuantity: 10,
        scheduledIncome: 1,
      }),
    ]);
    expect(response.body.scheduleTotals).toEqual({
      upcomingTotal: 1,
      paidTotal: 0,
    });
    // A renda mensal projetada continua com todas as cotas.
    expect(response.body.total).toBe(1.9);
  });

  // Revisão do #564: a compra na carteira 2 descontava também da carteira 1.
  it('deve atribuir a compra só à carteira que comprou', async () => {
    firestoreMock = compraNaCarteira2();

    const [carteira1, carteira2] = await Promise.all([
      renda('/api/wallets/wallet-1/monthly-income'),
      renda('/api/wallets/wallet-2/monthly-income'),
    ]);

    expect(carteira1.body.byTicker[0]).not.toHaveProperty(
      'quantityAfterComDate',
    );
    expect(carteira1.body.scheduleTotals.upcomingTotal).toBe(1);
    expect(carteira2.body.byTicker[0]).toMatchObject({
      quantityAfterComDate: 9,
      scheduledQuantity: 0,
      scheduledIncome: 0,
    });
    expect(carteira2.body.scheduleTotals.upcomingTotal).toBe(0);
  });

  it('deve fechar a soma das carteiras com o consolidado', async () => {
    firestoreMock = compraNaCarteira2();

    const respostas = await Promise.all([
      renda('/api/wallets/wallet-1/monthly-income'),
      renda('/api/wallets/wallet-2/monthly-income'),
      renda('/api/monthly-income'),
    ]);
    const [carteira1, carteira2, consolidado] = respostas.map(
      (response) => response.body.scheduleTotals.upcomingTotal,
    );

    expect(carteira1 + carteira2).toBe(consolidado);
  });

  // Revisão do #564: a compra feita só na geladeira descontava da carteira.
  it('não deve mexer na carteira quando a compra foi só na geladeira', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'MXRF11', quantity: 10 }] },
      ],
      fridgeItems: [{ ticker: 'MXRF11', quantity: 9 }],
      quotes: { MXRF11: mxrf },
      subscription: assinante,
      comDateSnapshots: {
        'MXRF11/2020-01-10': {
          'user-123': { wallets: { 'wallet-1': 10 }, fridge: 0 },
        },
      },
    });

    const response = await renda('/api/monthly-income');

    expect(response.status).toBe(200);
    expect(response.body.byTicker[0]).not.toHaveProperty(
      'quantityAfterComDate',
    );
    expect(response.body.scheduleTotals.upcomingTotal).toBe(1);
  });

  // Revisão do #564: quem vendeu depois da data-com recebe pela foto.
  it('deve pagar pela quantidade da foto quando houve venda depois da data-com', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'MXRF11', quantity: 19 }] },
      ],
      quotes: { MXRF11: mxrf },
      subscription: assinante,
      comDateSnapshots: {
        'MXRF11/2020-01-10': { 'user-123': { wallets: { 'wallet-1': 30 } } },
      },
    });

    const response = await renda('/api/monthly-income');

    expect(response.status).toBe(200);
    expect(response.body.byTicker[0]).toMatchObject({
      quantity: 19,
      monthlyIncome: 1.9,
      scheduledQuantity: 30,
      scheduledIncome: 3,
    });
    expect(response.body.scheduleTotals.upcomingTotal).toBe(3);
    expect(response.body.total).toBe(1.9);
  });

  it('deve levar o valor do pagamento aos itens da agenda recortada', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        { id: 'wallet-1', positions: [{ ticker: 'MXRF11', quantity: 19 }] },
      ],
      quotes: { MXRF11: mxrf },
      comDateSnapshots: {
        'MXRF11/2020-01-10': { 'user-123': { wallets: { 'wallet-1': 10 } } },
      },
    });

    const response = await renda('/api/monthly-income');

    expect(response.status).toBe(200);
    expect(response.body.limited).toBe(true);
    expect(response.body.scheduleItems).toEqual([
      expect.objectContaining({
        quantityAfterComDate: 9,
        scheduledQuantity: 10,
        scheduledIncome: 1,
      }),
    ]);
    expect(response.body.scheduleTotals.upcomingTotal).toBe(1);
  });
});

describe('GET /api/dashboard/summary', () => {
  const authHeader = 'Bearer valid-token';

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  it('deve consolidar patrimônio, geladeira e renda numa requisição', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        {
          id: 'wallet-1',
          positions: [
            { ticker: 'HGLG11', quantity: 10, averagePrice: 100 },
            { ticker: 'XPML11', quantity: 5, averagePrice: 50 },
          ],
        },
      ],
      fridgeItems: [{ ticker: 'KNCR11', quantity: 8, transferredPrice: 90 }],
      quotes: {
        HGLG11: { price: 110, monthlyDividend: 1 },
        XPML11: { price: 60, monthlyDividend: 0.5 },
        KNCR11: { price: 100, monthlyDividend: 0.8 },
      },
      subscription: { status: 'active', plan: 'basic' },
    });

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalWallet: 1400, // 10×110 + 5×60
      totalFridge: 800, // 8×100
      total: 2200,
      monthlyIncomeTotal: 18.9, // 10×1 + 5×0,5 + 8×0,8
      composition: [
        { ticker: 'HGLG11', value: 1100 },
        { ticker: 'XPML11', value: 300 },
      ],
    });
  });

  // O gráfico de composição usa preço médio quando não há cotação, como a
  // tela fazia antes.
  it('deve usar preço médio na composição quando falta cotação', async () => {
    firestoreMock = createFirestoreMock({
      wallets: [
        {
          id: 'wallet-1',
          positions: [{ ticker: 'ZZZZ11', quantity: 10, averagePrice: 20 }],
        },
      ],
      subscription: { status: 'active', plan: 'basic' },
    });

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', authHeader);

    expect(response.body.composition).toEqual([
      { ticker: 'ZZZZ11', value: 200 },
    ]);
    expect(response.body.totalWallet).toBe(200);
  });

  it('deve retornar 401 sem token', async () => {
    firestoreMock = createFirestoreMock({});

    const response = await request(app).get('/api/dashboard/summary');

    expect(response.status).toBe(401);
  });

  // O endpoint existe para cortar leitura (issue #300). Buscar posições e
  // itens por fora e de novo dentro do cálculo de renda dobrava o custo.
  it('deve ler posições, itens e cotações uma única vez', async () => {
    const mock = createFirestoreMock({
      wallets: [
        {
          id: 'wallet-1',
          positions: [{ ticker: 'HGLG11', quantity: 10, averagePrice: 100 }],
        },
      ],
      fridgeItems: [{ ticker: 'KNCR11', quantity: 8, transferredPrice: 90 }],
      quotes: { HGLG11: { price: 110 }, KNCR11: { price: 100 } },
      subscription: { status: 'active', plan: 'basic' },
    });
    firestoreMock = mock;

    await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', authHeader);

    expect(mock.walletsCollection.get.mock.calls).toHaveLength(1);
    expect(mock.fridgesCollection.get.mock.calls).toHaveLength(1);
    expect(mock.getAll.mock.calls).toHaveLength(1);
  });
});
