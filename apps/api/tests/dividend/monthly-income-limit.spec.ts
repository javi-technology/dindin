import {
  FREE_SCHEDULE_DATE_LIMIT,
  FREE_TICKER_LIMIT,
  appToday,
  computeScheduleTotals,
  limitMonthlyIncome,
} from '../../src/dividend/monthly-income-limit.service';
import { MonthlyIncomeItem } from '../../src/dividend/monthly-income.service';

// ---------------------------------------------------------------------------
// Recorte gratuito da projeção por ativo e da agenda de pagamentos (issue #262)
// ---------------------------------------------------------------------------

const TODAY = new Date('2026-09-17T12:00:00Z');

function item(
  ticker: string,
  monthlyIncome: number,
  paymentDate?: string,
  averageMonthlyIncome = monthlyIncome,
): MonthlyIncomeItem {
  return {
    ticker,
    quantity: 10,
    monthlyDividend: monthlyIncome / 10,
    monthlyIncome,
    averageMonthlyIncome,
    ...(paymentDate ? { paymentDate } : {}),
  };
}

describe('monthly-income-limit – limites', () => {
  it('deve liberar 3 ativos e 2 datas de pagamento', () => {
    expect(FREE_TICKER_LIMIT).toBe(3);
    expect(FREE_SCHEDULE_DATE_LIMIT).toBe(2);
  });
});

describe('monthly-income-limit – limitMonthlyIncome', () => {
  it('deve manter os 3 ativos de maior renda mensal, em ordem alfabética', () => {
    const items = [
      item('AAAA11', 5, '2026-09-15'),
      item('BBBB11', 45, '2026-09-11'),
      item('CCCC11', 39.1, '2026-09-08'),
      item('DDDD11', 26.1, '2026-09-15'),
    ];

    const { byTicker, hiddenTickers } = limitMonthlyIncome(items, TODAY);

    expect(byTicker.map((i) => i.ticker)).toEqual([
      'BBBB11',
      'CCCC11',
      'DDDD11',
    ]);
    expect(hiddenTickers).toEqual(['AAAA11']);
  });

  it('deve escolher os ativos pela média mensal, não pelo último provento', () => {
    const items = [
      // Semestral: último provento alto, média mensal baixa (#280).
      item('AAAA11', 120, '2026-09-15', 20),
      item('BBBB11', 45, '2026-09-11'),
      item('CCCC11', 39.1, '2026-09-08'),
      item('DDDD11', 26.1, '2026-09-15'),
    ];

    const { byTicker, hiddenTickers } = limitMonthlyIncome(items, TODAY);

    expect(byTicker.map((i) => i.ticker)).toEqual([
      'BBBB11',
      'CCCC11',
      'DDDD11',
    ]);
    expect(hiddenTickers).toEqual(['AAAA11']);
  });

  it('deve manter as 2 datas de pagamento mais próximas de hoje', () => {
    const items = [
      item('AAAA11', 7.36, '2026-08-25'),
      item('BBBB11', 16.1, '2026-09-08'),
      item('CCCC11', 39.1, '2026-09-08'),
      item('DDDD11', 45, '2026-09-11'),
      item('EEEE11', 9, '2026-09-15'),
      item('FFFF11', 5.9, '2026-09-15'),
    ];

    const { scheduleItems, hiddenPaymentDates } = limitMonthlyIncome(
      items,
      TODAY,
    );

    expect(scheduleItems.map((i) => i.ticker)).toEqual([
      'DDDD11',
      'EEEE11',
      'FFFF11',
    ]);
    expect(hiddenPaymentDates).toEqual(['2026-08-25', '2026-09-08']);
  });

  it('deve considerar pagamentos futuros na distância até hoje', () => {
    const items = [
      item('AAAA11', 10, '2026-07-20'),
      item('BBBB11', 10, '2026-09-16'),
      item('CCCC11', 10, '2026-09-20'),
      item('DDDD11', 10, '2026-12-01'),
    ];

    const { scheduleItems, hiddenPaymentDates } = limitMonthlyIncome(
      items,
      TODAY,
    );

    expect(scheduleItems.map((i) => i.ticker)).toEqual(['BBBB11', 'CCCC11']);
    expect(hiddenPaymentDates).toEqual(['2026-07-20', '2026-12-01']);
  });

  it('deve ignorar ativos sem data de pagamento na agenda', () => {
    const items = [item('AAAA11', 10), item('BBBB11', 10, '2026-09-16')];

    const { scheduleItems, hiddenPaymentDates, hiddenScheduleTickers } =
      limitMonthlyIncome(items, TODAY);

    expect(scheduleItems.map((i) => i.ticker)).toEqual(['BBBB11']);
    expect(hiddenPaymentDates).toEqual([]);
    // A seção "sem data anunciada" some no plano gratuito: sem esta lista o
    // ativo sumiria da tela sem nenhum aviso.
    expect(hiddenScheduleTickers).toEqual(['AAAA11']);
  });

  it('não deve esconder nada quando cabe no limite', () => {
    const items = [
      item('AAAA11', 10, '2026-09-16'),
      item('BBBB11', 20, '2026-09-16'),
    ];

    const limited = limitMonthlyIncome(items, TODAY);

    expect(limited.byTicker).toHaveLength(2);
    expect(limited.hiddenTickers).toEqual([]);
    expect(limited.hiddenPaymentDates).toEqual([]);
  });

  it('deve ignorar datas de pagamento inválidas', () => {
    const items = [
      item('AAAA11', 10, '17/09/2026'),
      item('BBBB11', 10, '2026-09-16'),
    ];

    const { scheduleItems, hiddenPaymentDates } = limitMonthlyIncome(
      items,
      TODAY,
    );

    expect(scheduleItems.map((i) => i.ticker)).toEqual(['BBBB11']);
    expect(hiddenPaymentDates).toEqual([]);
  });
});

describe('monthly-income-limit – appToday', () => {
  it('deve usar o dia no fuso de São Paulo, não o do servidor em UTC', () => {
    // 17/09 às 22h em São Paulo já é 18/09 em UTC; a tela do usuário diz 17.
    expect(appToday(new Date('2026-09-18T01:00:00Z')).toISOString()).toBe(
      '2026-09-17T00:00:00.000Z',
    );
    expect(appToday(new Date('2026-09-17T12:00:00Z')).toISOString()).toBe(
      '2026-09-17T00:00:00.000Z',
    );
  });
});

describe('monthly-income-limit – computeScheduleTotals', () => {
  it('deve somar pagos e a receber sobre todos os ativos', () => {
    const items = [
      item('AAAA11', 7.36, '2026-08-25'),
      item('BBBB11', 45, '2026-09-11'),
      item('CCCC11', 10, '2026-09-17'),
      item('DDDD11', 20, '2026-09-20'),
      item('EEEE11', 99),
    ];

    expect(computeScheduleTotals(items, TODAY)).toEqual({
      paidTotal: 52.36,
      upcomingTotal: 30,
    });
  });
});
