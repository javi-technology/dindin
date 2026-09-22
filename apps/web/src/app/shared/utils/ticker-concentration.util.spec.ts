import { MonthlyDividendReport } from '../../core/services/dividend.service';
import { buildTickerConcentration } from './ticker-concentration.util';

const report = (
  byTicker: { ticker: string; total: number }[],
): MonthlyDividendReport => ({
  year: 2026,
  months: [],
  byTicker,
  total: byTicker.reduce((sum, { total }) => sum + total, 0),
  availableYears: [2026],
});

const tickers = (quantidade: number): { ticker: string; total: number }[] =>
  Array.from({ length: quantidade }, (_, index) => ({
    ticker: `T${index + 1}`,
    total: quantidade - index,
  }));

describe('buildTickerConcentration', () => {
  it('deve ordenar os tickers do maior para o menor total', () => {
    const itens = buildTickerConcentration(
      report([
        { ticker: 'XPLG11', total: 30 },
        { ticker: 'HGLG11', total: 270 },
        { ticker: 'MXRF11', total: 100 },
      ]),
    );

    expect(itens.map((item) => item.label)).toEqual([
      'HGLG11',
      'MXRF11',
      'XPLG11',
    ]);
  });

  it('deve exibir o percentual do total ao lado do valor', () => {
    const itens = buildTickerConcentration(
      report([
        { ticker: 'HGLG11', total: 75 },
        { ticker: 'XPLG11', total: 25 },
      ]),
    );

    expect(itens[0].valueLabel).toContain('75,0%');
    expect(itens[1].valueLabel).toContain('25,0%');
    expect(itens[0].valueLabel).toContain('R$');
  });

  it('deve agrupar o excedente em "Outros" acima de 8 tickers', () => {
    const itens = buildTickerConcentration(report(tickers(12)));

    expect(itens.length).toBe(8);
    expect(itens[7].label).toBe('Outros');
    // Totais de 12 a 1; os 7 maiores somam 63, restando 15 para "Outros".
    expect(itens[7].value).toBe(15);
  });

  it('não deve agrupar quando há exatamente 8 tickers', () => {
    const itens = buildTickerConcentration(report(tickers(8)));

    expect(itens.length).toBe(8);
    expect(itens.some((item) => item.label === 'Outros')).toBe(false);
  });

  it('deve retornar lista vazia sem proventos no ano', () => {
    expect(buildTickerConcentration(report([]))).toEqual([]);
    expect(buildTickerConcentration(null)).toEqual([]);
  });

  it('deve ignorar tickers com total não positivo', () => {
    const itens = buildTickerConcentration(
      report([
        { ticker: 'HGLG11', total: 100 },
        { ticker: 'XPLG11', total: 0 },
      ]),
    );

    expect(itens.length).toBe(1);
    expect(itens[0].label).toBe('HGLG11');
  });
});
