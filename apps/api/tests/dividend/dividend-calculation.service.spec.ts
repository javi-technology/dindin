import { Dividend, Position } from 'dindin-models';
jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import * as functionsLogger from 'firebase-functions/logger';

import {
  computeDividendYield,
  latestDividendByTicker,
  latestDividendByTickerMap,
  normalizeTicker,
  quantityByTicker,
} from '../../src/dividend/dividend-calculation.service';

// ---------------------------------------------------------------------------
// Testes do cálculo de proventos (issue #225)
//
// Antes esta matemática vivia dentro do dividend.controller e só era
// alcançável subindo o Express e simulando request/response. Sendo função
// pura sobre arrays, agora é testada direto.
// ---------------------------------------------------------------------------

function dividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    id: 'div-1',
    ticker: 'HGLG11',
    amountPerShare: 0.8,
    quantity: 100,
    totalAmount: 80,
    paymentDate: '2026-01-15',
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  } as Dividend;
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    walletId: 'wallet-1',
    ticker: 'HGLG11',
    assetType: 'FII',
    quantity: 100,
    averagePrice: 100,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Position;
}

describe('normalizeTicker', () => {
  it('deve normalizar para maiúsculas sem espaços', () => {
    expect(normalizeTicker(' hglg11 ')).toBe('HGLG11');
  });

  it('deve devolver string vazia para valor não textual', () => {
    expect(normalizeTicker(undefined)).toBe('');
    expect(normalizeTicker(42)).toBe('');
  });
});

describe('latestDividendByTickerMap', () => {
  it('deve manter o provento de data de pagamento mais recente', () => {
    const map = latestDividendByTickerMap([
      dividend({
        id: 'antigo',
        paymentDate: '2026-01-15',
        amountPerShare: 0.5,
      }),
      dividend({ id: 'novo', paymentDate: '2026-02-15', amountPerShare: 0.9 }),
    ]);

    expect(map.get('HGLG11')?.id).toBe('novo');
  });

  // Dois lançamentos no mesmo dia: desempata pelo createdAt.
  it('deve desempatar mesma data pelo createdAt mais recente', () => {
    const map = latestDividendByTickerMap([
      dividend({
        id: 'primeiro',
        paymentDate: '2026-01-15',
        createdAt: '2026-01-15T08:00:00Z',
      }),
      dividend({
        id: 'segundo',
        paymentDate: '2026-01-15',
        createdAt: '2026-01-15T18:00:00Z',
      }),
    ]);

    expect(map.get('HGLG11')?.id).toBe('segundo');
  });

  it('deve agrupar tickers escritos de formas diferentes', () => {
    const map = latestDividendByTickerMap([
      dividend({ id: 'a', ticker: 'hglg11' }),
      dividend({ id: 'b', ticker: ' HGLG11 ', paymentDate: '2026-03-15' }),
    ]);

    expect(map.size).toBe(1);
    expect(map.get('HGLG11')?.id).toBe('b');
  });

  it('deve ignorar provento mal formado', () => {
    const errorSpy = jest
      .spyOn(functionsLogger, 'error')
      .mockImplementation(() => undefined);

    const map = latestDividendByTickerMap([
      dividend({ id: 'ruim', amountPerShare: NaN }),
      dividend({ id: 'quantidade-zero', ticker: 'XPML11', quantity: 0 }),
      dividend({ id: 'bom', ticker: 'MXRF11' }),
    ]);

    expect(map.has('HGLG11')).toBe(false);
    expect(map.has('XPML11')).toBe(false);
    expect(map.get('MXRF11')?.id).toBe('bom');
    expect(errorSpy).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });
});

describe('quantityByTicker', () => {
  it('deve somar a quantidade do mesmo ticker em carteiras diferentes', () => {
    const map = quantityByTicker([
      position({ id: 'a', quantity: 100 }),
      position({ id: 'b', walletId: 'wallet-2', quantity: 50 }),
    ]);

    expect(map.get('HGLG11')).toBe(150);
  });

  it('deve tratar quantidade inválida como zero', () => {
    const map = quantityByTicker([
      position({ id: 'a', quantity: Number.NaN }),
      position({ id: 'b', quantity: -10 }),
      position({ id: 'c', quantity: 30 }),
    ]);

    expect(map.get('HGLG11')).toBe(30);
  });
});

describe('latestDividendByTicker', () => {
  it('deve projetar o provento mensal pela quantidade em carteira', () => {
    const projection = latestDividendByTicker(
      [dividend({ amountPerShare: 0.8 })],
      [position({ quantity: 250 })],
    );

    expect(projection).toEqual([
      {
        ticker: 'HGLG11',
        amountPerShare: 0.8,
        quantity: 250,
        monthlyAmount: 200,
      },
    ]);
  });

  // Provento registrado de um ativo já vendido não deve projetar renda.
  it('deve excluir ticker sem posição em carteira', () => {
    const projection = latestDividendByTicker(
      [dividend({ ticker: 'VENDIDO11' })],
      [position({ ticker: 'HGLG11' })],
    );

    expect(projection).toEqual([]);
  });

  it('deve ordenar por ticker', () => {
    const projection = latestDividendByTicker(
      [
        dividend({ id: 'z', ticker: 'XPML11' }),
        dividend({ id: 'a', ticker: 'BTLG11' }),
      ],
      [
        position({ id: 'p1', ticker: 'XPML11' }),
        position({ id: 'p2', ticker: 'BTLG11' }),
      ],
    );

    expect(projection.map((item) => item.ticker)).toEqual(['BTLG11', 'XPML11']);
  });
});

describe('computeDividendYield – preço usado no valor investido', () => {
  // O `currentPrice` do documento é resíduo da denormalização que a #86
  // encerrou: ficou congelado no valor do dia em que o job parou de gravá-lo.
  // A #326 remove o campo, e o yield passa a usar a cotação atual.
  it('deve usar a cotação atual em vez do currentPrice gravado', () => {
    const result = computeDividendYield(
      [position({ quantity: 100, currentPrice: 999, averagePrice: 50 })],
      [dividend({ amountPerShare: 1 })],
      new Map([['HGLG11', 120]]),
    );

    expect(result.total.currentValue).toBe(12000);
  });

  it('deve cair para o preço médio quando não há cotação', () => {
    const result = computeDividendYield(
      [position({ quantity: 10, currentPrice: 999, averagePrice: 100 })],
      [dividend({ amountPerShare: 1 })],
      new Map(),
    );

    expect(result.total.currentValue).toBe(1000);
  });
});

describe('computeDividendYield', () => {
  it('deve calcular yield anualizado por ticker e total', () => {
    const result = computeDividendYield(
      [position({ quantity: 100 })],
      [dividend({ amountPerShare: 1 })],
      new Map([['HGLG11', 120]]),
    );

    // 1/cota × 100 cotas × 12 meses = 1200 ao ano sobre 12000 investidos = 10%
    expect(result.byTicker).toEqual([
      { ticker: 'HGLG11', annualIncome: 1200, currentValue: 12000, yield: 10 },
    ]);
    expect(result.total).toEqual({
      annualIncome: 1200,
      currentValue: 12000,
      yield: 10,
    });
  });

  it('deve usar o preço médio quando não há cotação atual', () => {
    const result = computeDividendYield(
      [position({ quantity: 10, averagePrice: 100 })],
      [dividend({ amountPerShare: 1 })],
    );

    expect(result.byTicker[0].currentValue).toBe(1000);
  });

  it('deve retornar yield zero para posição sem provento registrado', () => {
    const result = computeDividendYield(
      [position({ quantity: 10 })],
      [],
      new Map([['HGLG11', 100]]),
    );

    expect(result.byTicker[0]).toEqual({
      ticker: 'HGLG11',
      annualIncome: 0,
      currentValue: 1000,
      yield: 0,
    });
  });

  // Sem preço não há denominador: dividir por zero daria Infinity.
  it('deve retornar yield zero quando o valor investido é zero', () => {
    const result = computeDividendYield(
      [position({ quantity: 10, averagePrice: 0 })],
      [dividend({ amountPerShare: 1 })],
      new Map([['HGLG11', 0]]),
    );

    expect(result.byTicker[0].yield).toBe(0);
    expect(result.total.yield).toBe(0);
  });

  it('deve arredondar o yield em duas casas', () => {
    const result = computeDividendYield(
      [position({ quantity: 3 })],
      [dividend({ amountPerShare: 0.13 })],
      new Map([['HGLG11', 7]]),
    );

    expect(result.byTicker[0].yield).toBe(22.29);
  });

  it('deve somar o total de várias posições e ordenar por ticker', () => {
    const result = computeDividendYield(
      [
        position({ id: 'p1', ticker: 'XPML11', quantity: 10 }),
        position({ id: 'p2', ticker: 'BTLG11', quantity: 10 }),
      ],
      [
        dividend({ id: 'd1', ticker: 'XPML11', amountPerShare: 1 }),
        dividend({ id: 'd2', ticker: 'BTLG11', amountPerShare: 1 }),
      ],
      new Map([
        ['XPML11', 100],
        ['BTLG11', 100],
      ]),
    );

    expect(result.byTicker.map((item) => item.ticker)).toEqual([
      'BTLG11',
      'XPML11',
    ]);
    expect(result.total.currentValue).toBe(2000);
    // 10 cotas × R$ 1 × 12 meses = 120 por ticker
    expect(result.total.annualIncome).toBe(240);
  });

  it('deve retornar total zerado sem posições', () => {
    const result = computeDividendYield([], [dividend()]);

    expect(result.byTicker).toEqual([]);
    expect(result.total).toEqual({
      annualIncome: 0,
      currentValue: 0,
      yield: 0,
    });
  });
});
