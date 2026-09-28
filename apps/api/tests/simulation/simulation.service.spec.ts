const getRecommendedWalletMock = jest.fn();
const listRecommendedWalletsMock = jest.fn();
const assetExistsMock = jest.fn();
const getQuotesByTickerMock = jest.fn();

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({ collection: jest.fn() })),
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));

jest.mock('../../src/recommended-wallet/recommended-wallet.service', () => ({
  getRecommendedWallet: (...args: unknown[]) =>
    getRecommendedWalletMock(...args),
  listRecommendedWallets: (...args: unknown[]) =>
    listRecommendedWalletsMock(...args),
}));

jest.mock('../../src/assets/asset.service', () => ({
  assetExists: (...args: unknown[]) => assetExistsMock(...args),
}));

jest.mock('../../src/quotes/quote-prices', () => ({
  getQuotesByTicker: (...args: unknown[]) => getQuotesByTickerMock(...args),
}));

import {
  listSimulationProviders,
  simulateAsset,
  simulateRecommendedWallet,
} from '../../src/simulation/simulation.service';

const wallet = {
  id: 'bb-fii_2026-09',
  provider: 'BB',
  providerSlug: 'bb-fii',
  month: '2026-09',
  renda: [
    { ticker: 'AAAA11', weight: 0.5, closePrice: 12 },
    { ticker: 'BBBB11', weight: 0.5, closePrice: 25 },
  ],
  ganho: [{ ticker: 'GGGG11', weight: 1, closePrice: 10 }],
};

describe('simulation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRecommendedWalletMock.mockResolvedValue(wallet);
    listRecommendedWalletsMock.mockResolvedValue([wallet]);
    assetExistsMock.mockResolvedValue(true);
    getQuotesByTickerMock.mockResolvedValue(
      new Map([
        [
          'AAAA11',
          {
            price: 10,
            monthlyDividend: 0.1,
            dividendPaymentDate: '2026-09-15',
          },
        ],
        [
          'BBBB11',
          {
            price: 20,
            monthlyDividend: 0.2,
            dividendPaymentDate: '2026-09-15',
          },
        ],
      ]),
    );
  });

  it('deve simular a carteira sugerida mais recente do provedor padrão', async () => {
    const result = await simulateRecommendedWallet({
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(getRecommendedWalletMock).toHaveBeenCalledWith(undefined, 'bb-fii');
    expect(result.monthlyIncome).toBe(10);
    expect(result.walletMonth).toBe('2026-09');
    expect(result.tab).toBe('renda');
    expect(result.provider).toEqual(
      expect.objectContaining({ slug: 'bb-fii', provider: 'BB' }),
    );
  });

  it('deve simular o mês e a aba pedidos', async () => {
    const result = await simulateRecommendedWallet({
      amount: 1000,
      months: 1,
      mode: 'withdraw',
      month: '2026-08',
      tab: 'ganho',
    });

    expect(getRecommendedWalletMock).toHaveBeenCalledWith('2026-08', 'bb-fii');
    expect(result.tab).toBe('ganho');
    expect(result.byTicker.map((item) => item.ticker)).toEqual(['GGGG11']);
  });

  it('deve usar o preço de fechamento da carteira quando não há cotação', async () => {
    getQuotesByTickerMock.mockResolvedValue(new Map());

    const result = await simulateRecommendedWallet({
      amount: 1200,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker[0].price).toBe(12);
    expect(result.byTicker[0].missingPrice).toBeUndefined();
    expect(result.missingDividendTickers).toEqual(['AAAA11', 'BBBB11']);
  });

  // A Brapi devolve `regularMarketPrice: 0` para ativo sem negócio no dia, e o
  // mapeamento guarda esse zero. Com `??`, só `undefined` caía no fechamento:
  // o zero passava adiante e o motor descartava da alocação um ativo cuja
  // carteira sugerida traz preço de fechamento publicado (issue #396).
  it.each([0, -1])(
    'deve usar o preço de fechamento quando a cotação é %p',
    async (price) => {
      getQuotesByTickerMock.mockResolvedValue(
        new Map([
          ['AAAA11', { price, monthlyDividend: 0.1 }],
          ['BBBB11', { price: 25, monthlyDividend: 0.2 }],
        ]),
      );

      const result = await simulateRecommendedWallet({
        amount: 1200,
        months: 1,
        mode: 'withdraw',
      });

      const aaaa = result.byTicker.find((item) => item.ticker === 'AAAA11');
      expect(aaaa?.price).toBe(12);
      expect(aaaa?.missingPrice).toBeUndefined();
    },
  );

  it('deve recusar provedor fora do catálogo', async () => {
    await expect(
      simulateRecommendedWallet({
        amount: 1000,
        months: 1,
        mode: 'withdraw',
        provider: 'nao-existe',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Provedor de carteira sugerida não encontrado',
    });
  });

  it('deve recusar simulação sem carteira sugerida disponível', async () => {
    getRecommendedWalletMock.mockResolvedValue(null);

    await expect(
      simulateRecommendedWallet({ amount: 1000, months: 1, mode: 'withdraw' }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Carteira sugerida não encontrada',
    });
  });

  it('deve listar os provedores com os meses disponíveis', async () => {
    const providers = await listSimulationProviders();

    expect(providers).toEqual([
      expect.objectContaining({
        slug: 'bb-fii',
        label: expect.any(String),
        months: ['2026-09'],
      }),
    ]);
  });
});

describe('simulation.service — por ativo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assetExistsMock.mockResolvedValue(true);
    getQuotesByTickerMock.mockResolvedValue(
      new Map([
        [
          'AAAA11',
          {
            price: 10,
            monthlyDividend: 0.1,
            dividendPaymentDate: '2026-09-15',
          },
        ],
      ]),
    );
  });

  it('deve simular o valor inteiro em um único ativo', async () => {
    const result = await simulateAsset({
      ticker: 'AAAA11',
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(assetExistsMock).toHaveBeenCalledWith('AAAA11');
    expect(result.ticker).toBe('AAAA11');
    expect(result.byTicker).toHaveLength(1);
    expect(result.byTicker[0].quantity).toBe(100);
    expect(result.monthlyIncome).toBe(10);
  });

  it('deve informar o troco do ativo', async () => {
    const result = await simulateAsset({
      ticker: 'AAAA11',
      amount: 105,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker[0].quantity).toBe(10);
    expect(result.unallocatedAmount).toBe(5);
  });

  it('deve recusar ticker fora do catálogo', async () => {
    assetExistsMock.mockResolvedValue(false);

    await expect(
      simulateAsset({
        ticker: 'XXXX99',
        amount: 100,
        months: 1,
        mode: 'withdraw',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Ativo não encontrado no catálogo',
    });
  });

  it('deve recusar ativo sem cotação para simular', async () => {
    getQuotesByTickerMock.mockResolvedValue(new Map());

    await expect(
      simulateAsset({
        ticker: 'AAAA11',
        amount: 100,
        months: 1,
        mode: 'withdraw',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
