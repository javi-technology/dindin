import { QuoteHistory } from 'dindin-models';
import { buildMonthlyEntries } from '../../src/quotes/dividend-history-backfill';

const snapshot = (
  date: string,
  monthlyDividend: unknown,
): QuoteHistory =>
  ({ date, price: 100, monthlyDividend, source: 'brapi' }) as never;

describe('buildMonthlyEntries', () => {
  it('deve gerar um registro por mês com o snapshot mais recente', () => {
    const entries = buildMonthlyEntries([
      snapshot('2026-03-01', 1),
      snapshot('2026-03-20', 1.1),
      snapshot('2026-02-28', 0.9),
    ]);

    expect(entries).toEqual([
      jasmineLike({ month: '2026-02', date: '2026-02-28', monthlyDividend: 0.9 }),
      jasmineLike({ month: '2026-03', date: '2026-03-20', monthlyDividend: 1.1 }),
    ]);
  });

  it('deve aceitar snapshots em qualquer ordem', () => {
    const entries = buildMonthlyEntries([
      snapshot('2026-03-20', 1.1),
      snapshot('2026-03-01', 1),
    ]);

    expect(entries.length).toBe(1);
    expect(entries[0].monthlyDividend).toBe(1.1);
  });

  it('deve descartar snapshots sem provento numérico', () => {
    const entries = buildMonthlyEntries([
      snapshot('2026-03-20', null),
      snapshot('2026-03-10', 1.05),
      snapshot('2026-02-15', 'abc'),
    ]);

    expect(entries).toEqual([
      jasmineLike({ month: '2026-03', date: '2026-03-10', monthlyDividend: 1.05 }),
    ]);
  });

  it('deve descartar snapshots com data inválida', () => {
    const entries = buildMonthlyEntries([
      snapshot('15/03/2026', 1.1),
      snapshot('2026-03-10', 1.05),
    ]);

    expect(entries.length).toBe(1);
    expect(entries[0].month).toBe('2026-03');
  });

  it('deve retornar lista vazia sem snapshots', () => {
    expect(buildMonthlyEntries([])).toEqual([]);
  });
});

/** `updatedAt` é gerado na execução, então não entra na comparação exata. */
function jasmineLike(expected: {
  month: string;
  date: string;
  monthlyDividend: number;
}) {
  return { ...expected, updatedAt: expect.any(String) };
}
