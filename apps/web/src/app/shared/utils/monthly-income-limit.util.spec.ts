import { MonthlyIncomeResponse } from '../../core/services/dividend.service';
import {
  FREE_SCHEDULE_DATE_LIMIT,
  FREE_TICKER_LIMIT,
  buildFreeView,
} from './monthly-income-limit.util';

// ---------------------------------------------------------------------------
// Recorte gratuito agregando as carteiras (issue #262)
// ---------------------------------------------------------------------------

const TODAY = new Date('2026-09-17T12:00:00Z');

function item(
  ticker: string,
  monthlyIncome: number,
  paymentDate?: string,
  averageMonthlyIncome = monthlyIncome,
) {
  return {
    ticker,
    quantity: 10,
    monthlyDividend: monthlyIncome / 10,
    monthlyIncome,
    averageMonthlyIncome,
    ...(paymentDate ? { paymentDate } : {}),
  };
}

describe('buildFreeView', () => {
  it('deve expor os limites do plano gratuito', () => {
    expect(FREE_TICKER_LIMIT).toBe(3);
    expect(FREE_SCHEDULE_DATE_LIMIT).toBe(2);
  });

  it('não deve limitar quando nenhuma carteira veio recortada', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [item('AAAA11', 5, '2026-09-11')],
        total: 5,
        totalFromFridge: 0,
        limited: false,
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.limited).toBeFalse();
    expect(view.hiddenCount).toBe(0);
    expect(view.hiddenScheduleCount).toBe(0);
  });

  it('deve manter os 3 maiores ativos somando as carteiras', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [
          item('AAAA11', 45, '2026-09-11'),
          item('BBBB11', 39.1, '2026-09-15'),
          item('CCCC11', 26.1, '2026-09-15'),
        ],
        scheduleItems: [
          item('BBBB11', 39.1, '2026-09-15'),
          item('CCCC11', 26.1, '2026-09-15'),
        ],
        total: 110.2,
        totalFromFridge: 0,
        scheduleTotals: { upcomingTotal: 0, paidTotal: 110.2 },
        limited: true,
        hiddenTickers: ['DDDD11'],
        hiddenPaymentDates: ['2026-08-25'],
      },
      {
        byTicker: [item('EEEE11', 50, '2026-09-16')],
        scheduleItems: [item('EEEE11', 50, '2026-09-16')],
        total: 50,
        totalFromFridge: 0,
        scheduleTotals: { upcomingTotal: 0, paidTotal: 50 },
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.limited).toBeTrue();
    expect(view.byTicker.map((i) => i.ticker)).toEqual([
      'AAAA11',
      'BBBB11',
      'EEEE11',
    ]);
    // CCCC11 (cortado no agregado) + DDDD11 (já oculto na API).
    expect(view.hiddenCount).toBe(2);
  });

  it('deve escolher os 3 maiores ativos pela média mensal', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [
          // Semestral: último provento alto, média mensal baixa (#280).
          item('AAAA11', 120, '2026-09-11', 20),
          item('BBBB11', 39.1, '2026-09-15'),
          item('CCCC11', 26.1, '2026-09-15'),
        ],
        total: 85.2,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
      {
        byTicker: [item('DDDD11', 30, '2026-09-16')],
        total: 30,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.byTicker.map((i) => i.ticker)).toEqual([
      'BBBB11',
      'CCCC11',
      'DDDD11',
    ]);
  });

  it('deve somar o mesmo ticker vindo de carteiras diferentes', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [item('AAAA11', 10, '2026-09-16')],
        scheduleItems: [item('AAAA11', 10, '2026-09-16')],
        total: 10,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
      {
        byTicker: [item('AAAA11', 5, '2026-09-16')],
        scheduleItems: [item('AAAA11', 5, '2026-09-16')],
        total: 5,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.byTicker).toEqual([
      {
        ticker: 'AAAA11',
        quantity: 20,
        monthlyDividend: 1,
        monthlyIncome: 15,
        averageMonthlyIncome: 15,
        paymentDate: '2026-09-16',
      },
    ]);
    expect(view.hiddenCount).toBe(0);
  });

  it('deve esconder o ticker cortado em qualquer carteira', () => {
    // A API recorta cada carteira: somar só a parcela que sobrou mostraria
    // quantidade e renda menores que as reais.
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [item('BBBB11', 45, '2026-09-16')],
        scheduleItems: [item('BBBB11', 45, '2026-09-16')],
        total: 245,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: ['AAAA11'],
        hiddenPaymentDates: [],
      },
      {
        byTicker: [item('AAAA11', 5, '2026-09-16')],
        scheduleItems: [item('AAAA11', 5, '2026-09-16')],
        total: 5,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.byTicker.map((i) => i.ticker)).toEqual(['BBBB11']);
    expect(view.scheduleItems.map((i) => i.ticker)).toEqual(['BBBB11']);
    expect(view.hiddenCount).toBe(1);
  });

  it('deve esconder a data cortada em qualquer carteira', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [item('AAAA11', 45, '2026-09-16')],
        scheduleItems: [item('AAAA11', 45, '2026-09-16')],
        total: 45,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: ['2026-09-18'],
      },
      {
        byTicker: [item('BBBB11', 5, '2026-09-18')],
        scheduleItems: [item('BBBB11', 5, '2026-09-18')],
        total: 5,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.scheduleItems.map((i) => i.ticker)).toEqual(['AAAA11']);
    expect(view.hiddenScheduleCount).toBe(1);
  });

  it('deve contar os ativos sem data anunciada bloqueados na agenda', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [item('AAAA11', 45, '2026-09-16')],
        scheduleItems: [item('AAAA11', 45, '2026-09-16')],
        total: 45,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
        hiddenScheduleTickers: ['CCCC11'],
      },
      {
        byTicker: [],
        scheduleItems: [],
        total: 0,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
        hiddenScheduleTickers: ['CCCC11', 'DDDD11'],
      },
    ];

    expect(buildFreeView(responses, TODAY).hiddenWithoutDateCount).toBe(2);
  });

  it('deve manter as 2 datas mais próximas de hoje na agenda', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [],
        scheduleItems: [
          item('AAAA11', 10, '2026-09-16'),
          item('BBBB11', 20, '2026-09-20'),
          item('CCCC11', 30, '2026-07-10'),
        ],
        total: 60,
        totalFromFridge: 0,
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: ['2026-12-01'],
      },
    ];

    const view = buildFreeView(responses, TODAY);

    expect(view.scheduleItems.map((i) => i.ticker)).toEqual([
      'AAAA11',
      'BBBB11',
    ]);
    // 2026-07-10 (cortada aqui) + 2026-12-01 (já oculta na API).
    expect(view.hiddenScheduleCount).toBe(2);
  });

  it('deve somar os totais da agenda das carteiras', () => {
    const responses: MonthlyIncomeResponse[] = [
      {
        byTicker: [],
        scheduleItems: [],
        total: 0,
        totalFromFridge: 0,
        scheduleTotals: { upcomingTotal: 10.5, paidTotal: 20.25 },
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
      {
        byTicker: [],
        scheduleItems: [],
        total: 0,
        totalFromFridge: 0,
        scheduleTotals: { upcomingTotal: 1.5, paidTotal: 0.75 },
        limited: true,
        hiddenTickers: [],
        hiddenPaymentDates: [],
      },
    ];

    expect(buildFreeView(responses, TODAY).scheduleTotals).toEqual({
      upcomingTotal: 12,
      paidTotal: 21,
    });
  });
});
