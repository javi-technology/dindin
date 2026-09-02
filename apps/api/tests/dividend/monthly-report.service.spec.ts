import { Dividend } from 'dindin-models';
import { buildMonthlyDividendReport } from '../../src/dividend/monthly-report.service';

const dividend = (overrides: Partial<Dividend> = {}): Dividend =>
  ({
    id: 'dividend-1',
    userId: 'user-123',
    ticker: 'HGLG11',
    amountPerShare: 1,
    quantity: 100,
    totalAmount: 100,
    paymentDate: '2026-01-15',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as Dividend;

describe('buildMonthlyDividendReport', () => {
  it('agrupa por mês e ticker e calcula os totais anuais', () => {
    const report = buildMonthlyDividendReport(
      [
        dividend({ id: '1', paymentDate: '2026-01-15', totalAmount: 100 }),
        dividend({ id: '2', paymentDate: '2026-01-20', totalAmount: 50 }),
        dividend({
          id: '3',
          ticker: 'XPLG11',
          paymentDate: '2026-01-10',
          totalAmount: 30,
        }),
        dividend({ id: '4', paymentDate: '2026-03-15', totalAmount: 120 }),
        dividend({ id: '5', paymentDate: '2025-12-15', totalAmount: 10 }),
        dividend({ id: '6', paymentDate: '2027-01-15', totalAmount: 20 }),
      ],
      2026,
    );

    expect(report).toEqual({
      year: 2026,
      months: [
        {
          month: '2026-01',
          total: 180,
          byTicker: [
            { ticker: 'HGLG11', total: 150 },
            { ticker: 'XPLG11', total: 30 },
          ],
        },
        {
          month: '2026-03',
          total: 120,
          byTicker: [{ ticker: 'HGLG11', total: 120 }],
        },
      ],
      byTicker: [
        { ticker: 'HGLG11', total: 270 },
        { ticker: 'XPLG11', total: 30 },
      ],
      total: 300,
      availableYears: [2027, 2026, 2025],
    });
  });

  it('filtra o ano selecionado e mantém anos disponíveis de todos os dividendos', () => {
    const report = buildMonthlyDividendReport(
      [
        dividend({ paymentDate: '2025-12-01', totalAmount: 10 }),
        dividend({ paymentDate: '2026-01-01', totalAmount: 20 }),
        dividend({ paymentDate: '2027-02-01', totalAmount: 30 }),
      ],
      2026,
    );

    expect(report.months).toEqual([
      {
        month: '2026-01',
        total: 20,
        byTicker: [{ ticker: 'HGLG11', total: 20 }],
      },
    ]);
    expect(report.total).toBe(20);
    expect(report.availableYears).toEqual([2027, 2026, 2025]);
  });

  it('normaliza tickers e mescla valores com maiúsculas e espaços', () => {
    const report = buildMonthlyDividendReport(
      [
        dividend({
          ticker: ' hglg11 ',
          paymentDate: '2026-01-01',
          totalAmount: 10.126,
        }),
        dividend({
          ticker: 'HGLG11',
          paymentDate: '2026-01-01',
          totalAmount: 20.129,
        }),
      ],
      2026,
    );

    expect(report.months[0].byTicker).toEqual([
      { ticker: 'HGLG11', total: 30.26 },
    ]);
    expect(report.months[0].total).toBe(30.26);
    expect(report.byTicker).toEqual([{ ticker: 'HGLG11', total: 30.26 }]);
  });

  it('ignora dividendos malformados e usa o fallback calculado quando válido', () => {
    const report = buildMonthlyDividendReport(
      [
        dividend({ id: 'bad-date', paymentDate: '2026/01/01' }),
        dividend({
          id: 'bad-number',
          paymentDate: '2026-01-02',
          totalAmount: Number.NaN,
        }),
        dividend({
          id: 'empty-ticker',
          ticker: '   ',
          paymentDate: '2026-01-03',
        }),
        {
          ...dividend({
            id: 'fallback',
            paymentDate: '2026-01-04',
            amountPerShare: 2.5,
            quantity: 4,
          }),
          totalAmount: undefined,
        } as unknown as Dividend,
      ],
      2026,
    );

    expect(report.total).toBe(10);
    expect(report.months[0].byTicker).toEqual([
      { ticker: 'HGLG11', total: 10 },
    ]);
  });

  it('ignora datas impossíveis e anos fora do intervalo do relatório', () => {
    const report = buildMonthlyDividendReport(
      [
        dividend({ paymentDate: '2026-13-01' }),
        dividend({ paymentDate: '2026-02-30' }),
        dividend({ paymentDate: '1800-01-01' }),
        dividend({ paymentDate: '2101-01-01' }),
      ],
      2026,
    );

    expect(report.months).toEqual([]);
    expect(report.byTicker).toEqual([]);
    expect(report.total).toBe(0);
    expect(report.availableYears).toEqual([]);
  });

  it('retorna relatório vazio para uma entrada vazia', () => {
    expect(buildMonthlyDividendReport([], 2026)).toEqual({
      year: 2026,
      months: [],
      byTicker: [],
      total: 0,
      availableYears: [],
    });
  });
});
