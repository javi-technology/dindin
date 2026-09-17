import {
  DividendYieldResponse,
  MonthlyDividendReport,
} from '../../core/services/dividend.service';
import {
  aggregateDividendYield,
  lastMonthSummary,
  monthlyAverage,
} from './dividend-kpi.util';

const yieldResponse = (
  annualIncome: number,
  currentValue: number,
): DividendYieldResponse => ({
  byTicker: [],
  total: {
    annualIncome,
    currentValue,
    yield: currentValue > 0 ? (annualIncome / currentValue) * 100 : 0,
  },
});

const report = (
  months: { month: string; total: number }[],
): MonthlyDividendReport => ({
  year: 2026,
  months: months.map(({ month, total }) => ({ month, total, byTicker: [] })),
  byTicker: [],
  total: months.reduce((sum, { total }) => sum + total, 0),
  availableYears: [2026],
});

describe('dividend-kpi.util', () => {
  describe('aggregateDividendYield', () => {
    it('deve somar renda anual e patrimônio de todas as carteiras', () => {
      const resultado = aggregateDividendYield([
        yieldResponse(1200, 100000),
        yieldResponse(600, 50000),
      ]);

      expect(resultado.annualIncome).toBe(1800);
      expect(resultado.currentValue).toBe(150000);
      expect(resultado.yield).toBeCloseTo(1.2, 4);
    });

    it('deve retornar zeros quando não há carteiras', () => {
      expect(aggregateDividendYield([])).toEqual({
        annualIncome: 0,
        currentValue: 0,
        yield: 0,
      });
    });

    it('deve retornar yield zero quando o patrimônio é zero', () => {
      expect(aggregateDividendYield([yieldResponse(500, 0)]).yield).toBe(0);
    });
  });

  describe('monthlyAverage', () => {
    it('deve calcular a média sobre os meses com provento registrado', () => {
      const media = monthlyAverage(
        report([
          { month: '2026-01', total: 100 },
          { month: '2026-02', total: 200 },
        ]),
      );

      expect(media).toBe(150);
    });

    it('deve retornar zero sem meses registrados', () => {
      expect(monthlyAverage(report([]))).toBe(0);
    });

    it('deve retornar zero quando não há relatório', () => {
      expect(monthlyAverage(null)).toBe(0);
    });
  });

  describe('lastMonthSummary', () => {
    it('deve retornar o último mês com a variação sobre o anterior', () => {
      const resumo = lastMonthSummary(
        report([
          { month: '2026-01', total: 100 },
          { month: '2026-02', total: 150 },
        ]),
      );

      expect(resumo?.month).toBe('2026-02');
      expect(resumo?.total).toBe(150);
      expect(resumo?.variation).toBeCloseTo(50, 4);
    });

    it('deve calcular variação negativa', () => {
      const resumo = lastMonthSummary(
        report([
          { month: '2026-01', total: 200 },
          { month: '2026-02', total: 150 },
        ]),
      );

      expect(resumo?.variation).toBeCloseTo(-25, 4);
    });

    it('deve omitir a variação quando há apenas um mês', () => {
      const resumo = lastMonthSummary(
        report([{ month: '2026-01', total: 80 }]),
      );

      expect(resumo?.total).toBe(80);
      expect(resumo?.variation).toBeNull();
    });

    it('deve omitir a variação quando o mês anterior não teve provento', () => {
      // months é esparso: a API só devolve meses com provento registrado.
      const resumo = lastMonthSummary(
        report([
          { month: '2026-01', total: 100 },
          { month: '2026-06', total: 150 },
        ]),
      );

      expect(resumo?.month).toBe('2026-06');
      expect(resumo?.variation).toBeNull();
    });

    it('deve comparar com o mês calendário anterior ao virar o ano', () => {
      const resumo = lastMonthSummary(
        report([
          { month: '2025-12', total: 100 },
          { month: '2026-01', total: 150 },
        ]),
      );

      expect(resumo?.variation).toBeCloseTo(50, 4);
    });

    it('deve omitir a variação quando o mês anterior é zero', () => {
      const resumo = lastMonthSummary(
        report([
          { month: '2026-01', total: 0 },
          { month: '2026-02', total: 120 },
        ]),
      );

      expect(resumo?.variation).toBeNull();
    });

    it('deve retornar null quando não há meses', () => {
      expect(lastMonthSummary(report([]))).toBeNull();
      expect(lastMonthSummary(null)).toBeNull();
    });
  });
});
