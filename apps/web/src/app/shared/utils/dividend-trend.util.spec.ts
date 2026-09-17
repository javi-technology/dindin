import { dividendTrend } from './dividend-trend.util';

describe('dividendTrend', () => {
  it('deve indicar alta quando o último valor supera o anterior', () => {
    expect(dividendTrend([0.9, 1.1])).toBe('up');
  });

  it('deve indicar baixa quando o último valor é menor', () => {
    expect(dividendTrend([1.1, 0.9])).toBe('down');
  });

  it('deve indicar estabilidade quando os valores são iguais', () => {
    expect(dividendTrend([1, 1])).toBe('stable');
  });

  it('deve comparar apenas os dois últimos valores', () => {
    expect(dividendTrend([5, 0.9, 1.1])).toBe('up');
  });

  it('deve retornar null com menos de dois valores', () => {
    expect(dividendTrend([1])).toBeNull();
    expect(dividendTrend([])).toBeNull();
  });
});
