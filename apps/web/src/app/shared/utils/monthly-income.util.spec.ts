import { aggregateMonthlyIncome } from './monthly-income.util';

describe('aggregateMonthlyIncome', () => {
  it('deve retornar totais zerados sem respostas', () => {
    expect(aggregateMonthlyIncome([])).toEqual({
      byTicker: [],
      total: 0,
      totalFromFridge: 0,
    });
  });

  it('deve somar quantidades e proventos do mesmo ticker em carteiras diferentes', () => {
    const aggregated = aggregateMonthlyIncome([
      {
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 10,
            monthlyDividend: 1.1,
            monthlyIncome: 11,
          },
        ],
        total: 11,
        totalFromFridge: 0,
      },
      {
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 5,
            monthlyDividend: 1.1,
            monthlyIncome: 5.5,
          },
          {
            ticker: 'XPLG11',
            quantity: 20,
            monthlyDividend: 0.7,
            monthlyIncome: 14,
          },
        ],
        total: 19.5,
        totalFromFridge: 0,
      },
    ]);

    expect(aggregated.byTicker).toEqual([
      {
        ticker: 'HGLG11',
        quantity: 15,
        monthlyDividend: 1.1,
        monthlyIncome: 16.5,
      },
      {
        ticker: 'XPLG11',
        quantity: 20,
        monthlyDividend: 0.7,
        monthlyIncome: 14,
      },
    ]);
    expect(aggregated.total).toBe(30.5);
  });

  it('deve contar a geladeira uma única vez', () => {
    const aggregated = aggregateMonthlyIncome([
      { byTicker: [], total: 130, totalFromFridge: 30 },
      { byTicker: [], total: 80, totalFromFridge: 30 },
    ]);

    expect(aggregated.totalFromFridge).toBe(30);
    expect(aggregated.total).toBe(180);
  });
});
