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
            averageMonthlyIncome: 11,
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
            averageMonthlyIncome: 5.5,
          },
          {
            ticker: 'XPLG11',
            quantity: 20,
            monthlyDividend: 0.7,
            monthlyIncome: 14,
            averageMonthlyIncome: 14,
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
        averageMonthlyIncome: 16.5,
      },
      {
        ticker: 'XPLG11',
        quantity: 20,
        monthlyDividend: 0.7,
        monthlyIncome: 14,
        averageMonthlyIncome: 14,
      },
    ]);
    expect(aggregated.total).toBe(30.5);
  });

  it('deve somar a média mensal do mesmo ticker em carteiras diferentes', () => {
    const petr4 = (quantity: number) => ({
      ticker: 'PETR4',
      quantity,
      monthlyDividend: 1.2,
      monthlyIncome: quantity * 1.2,
      averageMonthlyIncome: quantity * 0.2,
    });

    const aggregated = aggregateMonthlyIncome([
      { byTicker: [petr4(100)], total: 20, totalFromFridge: 0 },
      { byTicker: [petr4(50)], total: 10, totalFromFridge: 0 },
    ]);

    expect(aggregated.byTicker).toEqual([
      {
        ticker: 'PETR4',
        quantity: 150,
        monthlyDividend: 1.2,
        monthlyIncome: 180,
        averageMonthlyIncome: 30,
      },
    ]);
    expect(aggregated.total).toBe(30);
  });

  it('deve preservar a data de pagamento ao consolidar o mesmo ticker', () => {
    const aggregated = aggregateMonthlyIncome([
      {
        byTicker: [
          {
            ticker: 'HGLG11',
            quantity: 10,
            monthlyDividend: 1.1,
            monthlyIncome: 11,
            averageMonthlyIncome: 11,
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
            averageMonthlyIncome: 5.5,
            paymentDate: '2026-09-15',
          },
        ],
        total: 5.5,
        totalFromFridge: 0,
      },
    ]);

    expect(aggregated.byTicker[0].paymentDate).toBe('2026-09-15');
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
