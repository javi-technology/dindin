import { MonthlyDividendReport } from '../../core/services/dividend.service';
import { buildMonthlySeries } from './monthly-series.util';

const report = (
  year: number,
  months: { month: string; total: number }[],
): MonthlyDividendReport => ({
  year,
  months: months.map(({ month, total }) => ({ month, total, byTicker: [] })),
  byTicker: [],
  total: months.reduce((sum, { total }) => sum + total, 0),
  availableYears: [year],
});

describe('buildMonthlySeries', () => {
  it('deve montar os 12 meses do ano mesmo com poucos registros', () => {
    const serie = buildMonthlySeries(
      report(2026, [
        { month: '2026-03', total: 120 },
        { month: '2026-01', total: 180 },
      ]),
      2026,
      new Date(2026, 5, 10),
    );

    expect(serie.length).toBe(12);
    expect(serie[0]).toEqual(
      expect.objectContaining({ label: 'jan', value: 180 }),
    );
    expect(serie[1]).toEqual(
      expect.objectContaining({ label: 'fev', value: 0 }),
    );
    expect(serie[2]).toEqual(
      expect.objectContaining({ label: 'mar', value: 120 }),
    );
    expect(serie[11].label).toBe('dez');
  });

  it('deve destacar o mês corrente quando o ano exibido é o ano atual', () => {
    const serie = buildMonthlySeries(
      report(2026, [{ month: '2026-06', total: 90 }]),
      2026,
      new Date(2026, 5, 10),
    );

    const destacados = serie.filter((item) => item.highlight);

    expect(destacados.length).toBe(1);
    expect(destacados[0].label).toBe('jun');
  });

  it('não deve destacar nenhum mês em anos anteriores', () => {
    const serie = buildMonthlySeries(
      report(2025, [{ month: '2025-06', total: 90 }]),
      2025,
      new Date(2026, 5, 10),
    );

    expect(serie.some((item) => item.highlight)).toBe(false);
  });

  it('deve ignorar meses de outros anos presentes no relatório', () => {
    const serie = buildMonthlySeries(
      report(2026, [
        { month: '2025-03', total: 999 },
        { month: '2026-03', total: 120 },
      ]),
      2026,
      new Date(2026, 5, 10),
    );

    expect(serie[2].value).toBe(120);
    expect(serie.reduce((sum, item) => sum + item.value, 0)).toBe(120);
  });

  it('deve retornar 12 meses zerados quando não há relatório', () => {
    const serie = buildMonthlySeries(null, 2026, new Date(2026, 5, 10));

    expect(serie.length).toBe(12);
    expect(serie.every((item) => item.value === 0)).toBe(true);
  });
});
