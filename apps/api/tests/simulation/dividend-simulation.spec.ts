import {
  STALE_DIVIDEND_DAYS,
  simulateDividendIncome,
} from '../../src/simulation/dividend-simulation';
import { todayAsUtcDate } from '../../src/shared/date';

const assets = [
  { ticker: 'AAAA11', weight: 0.5, price: 10, monthlyDividend: 0.1 },
  { ticker: 'BBBB11', weight: 0.5, price: 20, monthlyDividend: 0.2 },
];

describe('dividend-simulation', () => {
  it('deve projetar a renda de um único mês com cotas inteiras', () => {
    const result = simulateDividendIncome({
      assets,
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.allocatedAmount).toBe(1000);
    expect(result.unallocatedAmount).toBe(0);
    expect(result.monthlyIncome).toBe(10);
    expect(result.totalIncome).toBe(10);
    expect(result.byTicker).toEqual([
      expect.objectContaining({
        ticker: 'AAAA11',
        quantity: 50,
        investedAmount: 500,
        monthlyIncome: 5,
        totalIncome: 5,
      }),
      expect.objectContaining({
        ticker: 'BBBB11',
        quantity: 25,
        investedAmount: 500,
        monthlyIncome: 5,
        totalIncome: 5,
      }),
    ]);
  });

  it('deve deixar a premissa da projeção explícita no resultado', () => {
    const result = simulateDividendIncome({
      assets,
      amount: 1000,
      months: 6,
      mode: 'withdraw',
    });

    expect(result.basis).toEqual({
      source: 'monthlyDividend',
      assumesRepetition: true,
      staleAfterDays: STALE_DIVIDEND_DAYS,
    });
  });

  it('deve repetir o provento mês a mês quando os proventos são sacados', () => {
    const result = simulateDividendIncome({
      assets,
      amount: 1000,
      months: 12,
      mode: 'withdraw',
    });

    expect(result.totalIncome).toBe(120);
    expect(result.reinvestedAmount).toBe(0);
    expect(result.uninvestedIncome).toBe(0);
    expect(result.byTicker.map((item) => item.finalQuantity)).toEqual([50, 25]);
  });

  it('deve comprar novas cotas quando os proventos são reinvestidos', () => {
    const withdrawn = simulateDividendIncome({
      assets,
      amount: 1000,
      months: 12,
      mode: 'withdraw',
    });
    const reinvested = simulateDividendIncome({
      assets,
      amount: 1000,
      months: 12,
      mode: 'reinvest',
    });

    expect(reinvested.totalIncome).toBeGreaterThan(withdrawn.totalIncome);
    expect(reinvested.reinvestedAmount).toBeGreaterThan(0);
    expect(
      reinvested.byTicker.reduce(
        (total, item) => total + item.finalQuantity,
        0,
      ),
    ).toBeGreaterThan(75);
  });

  it('deve produzir o mesmo total em um único mês nos dois modos', () => {
    const base = { assets, amount: 1000, months: 1 } as const;

    expect(
      simulateDividendIncome({ ...base, mode: 'reinvest' }).totalIncome,
    ).toBe(simulateDividendIncome({ ...base, mode: 'withdraw' }).totalIncome);
  });

  it('deve informar o troco que não completou uma cota', () => {
    const result = simulateDividendIncome({
      assets: [{ ticker: 'AAAA11', price: 30, monthlyDividend: 1 }],
      amount: 100,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker[0].quantity).toBe(3);
    expect(result.allocatedAmount).toBe(90);
    expect(result.unallocatedAmount).toBe(10);
  });

  it('deve realocar o troco em quem ainda não tem cota inteira', () => {
    const result = simulateDividendIncome({
      assets: [
        { ticker: 'CARO11', weight: 0.5, price: 90, monthlyDividend: 1 },
        { ticker: 'BARA11', weight: 0.5, price: 10, monthlyDividend: 1 },
      ],
      amount: 100,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker.map((item) => item.quantity)).toEqual([0, 10]);
    expect(result.unallocatedAmount).toBe(0);
  });

  it('deve marcar o ativo sem provento conhecido em vez de tratá-lo como zero', () => {
    const result = simulateDividendIncome({
      assets: [
        { ticker: 'AAAA11', weight: 0.5, price: 10, monthlyDividend: 0.1 },
        { ticker: 'SEMP11', weight: 0.5, price: 10 },
      ],
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.missingDividendTickers).toEqual(['SEMP11']);
    expect(result.byTicker[1]).toEqual(
      expect.objectContaining({
        ticker: 'SEMP11',
        quantity: 50,
        monthlyIncome: 0,
        missingDividend: true,
      }),
    );
    expect(result.byTicker[0].missingDividend).toBeUndefined();
  });

  it('deve tratar provento zerado como provento desconhecido', () => {
    const result = simulateDividendIncome({
      assets: [{ ticker: 'ZERO11', price: 10, monthlyDividend: 0 }],
      amount: 100,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.missingDividendTickers).toEqual(['ZERO11']);
  });

  it('deve marcar o ativo cujo último provento está desatualizado', () => {
    const result = simulateDividendIncome({
      assets: [
        {
          ticker: 'VELH11',
          price: 10,
          monthlyDividend: 0.1,
          dividendPaymentDate: '2026-01-10',
        },
      ],
      amount: 100,
      months: 1,
      mode: 'withdraw',
      referenceDate: '2026-09-28',
    });

    expect(result.staleDividendTickers).toEqual(['VELH11']);
    expect(result.byTicker[0].staleDividend).toBe(true);
  });

  it('não deve marcar como desatualizado o provento dentro do prazo', () => {
    const result = simulateDividendIncome({
      assets: [
        {
          ticker: 'NOVO11',
          price: 10,
          monthlyDividend: 0.1,
          dividendPaymentDate: '2026-09-10',
        },
      ],
      amount: 100,
      months: 1,
      mode: 'withdraw',
      referenceDate: '2026-09-28',
    });

    expect(result.staleDividendTickers).toEqual([]);
    expect(result.byTicker[0].staleDividend).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Fronteira dos 90 dias sem `referenceDate` (issue #395)
  //
  // Em produção o `reference` era `new Date()`, com horário, comparado contra a
  // meia-noite UTC do pagamento. No 90º dia, qualquer hora depois da meia-noite
  // já passava dos 90 dias e o ativo aparecia como desatualizado um dia antes
  // do prazo. Os testes acima não pegavam isso porque passam `referenceDate`,
  // que já vem normalizado.
  // -------------------------------------------------------------------------
  describe('sem data de referência informada', () => {
    const simularComPagamentoEm = (paymentDate: string) =>
      simulateDividendIncome({
        assets: [
          {
            ticker: 'VELH11',
            price: 10,
            monthlyDividend: 0.1,
            dividendPaymentDate: paymentDate,
          },
        ],
        amount: 100,
        months: 1,
        mode: 'withdraw',
      });

    /** `dias` antes de hoje no fuso do produto, como `YYYY-MM-DD`. */
    const diasAtras = (dias: number): string => {
      const hoje = todayAsUtcDate();
      hoje.setUTCDate(hoje.getUTCDate() - dias);
      return hoje.toISOString().slice(0, 10);
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    // Fim do dia no fuso do produto: é a hora em que a comparação com horário
    // estourava o prazo.
    function fixarRelogioNoFimDoDia(): void {
      jest.useFakeTimers();
      const agora = new Date();
      agora.setUTCHours(23, 59, 0, 0);
      jest.setSystemTime(agora);
    }

    it('não deve marcar como desatualizado o provento no 90º dia', () => {
      fixarRelogioNoFimDoDia();

      const result = simularComPagamentoEm(diasAtras(STALE_DIVIDEND_DAYS));

      expect(result.staleDividendTickers).toEqual([]);
      expect(result.byTicker[0].staleDividend).toBeUndefined();
    });

    it('deve marcar como desatualizado o provento no 91º dia', () => {
      fixarRelogioNoFimDoDia();

      const result = simularComPagamentoEm(diasAtras(STALE_DIVIDEND_DAYS + 1));

      expect(result.staleDividendTickers).toEqual(['VELH11']);
    });
  });

  it('deve manter fora da alocação o ativo sem preço utilizável', () => {
    const result = simulateDividendIncome({
      assets: [
        { ticker: 'AAAA11', weight: 0.5, price: 10, monthlyDividend: 0.1 },
        { ticker: 'SEMC11', weight: 0.5, monthlyDividend: 0.5 },
      ],
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker[1]).toEqual(
      expect.objectContaining({
        ticker: 'SEMC11',
        quantity: 0,
        missingPrice: true,
      }),
    );
    expect(result.byTicker[0].quantity).toBe(100);
    expect(result.unallocatedAmount).toBe(0);
  });

  it('deve dividir igualmente quando nenhum ativo traz peso', () => {
    const result = simulateDividendIncome({
      assets: [
        { ticker: 'AAAA11', price: 10, monthlyDividend: 0.1 },
        { ticker: 'BBBB11', price: 10, monthlyDividend: 0.1 },
      ],
      amount: 1000,
      months: 1,
      mode: 'withdraw',
    });

    expect(result.byTicker.map((item) => item.quantity)).toEqual([50, 50]);
  });

  it('deve devolver resultado vazio quando não há ativo simulável', () => {
    const result = simulateDividendIncome({
      assets: [],
      amount: 1000,
      months: 12,
      mode: 'reinvest',
    });

    expect(result.byTicker).toEqual([]);
    expect(result.totalIncome).toBe(0);
    expect(result.allocatedAmount).toBe(0);
    expect(result.unallocatedAmount).toBe(1000);
  });

  it('deve ecoar o aporte, o horizonte e o modo simulados', () => {
    const result = simulateDividendIncome({
      assets,
      amount: 1500.55,
      months: 24,
      mode: 'reinvest',
    });

    expect(result.amount).toBe(1500.55);
    expect(result.months).toBe(24);
    expect(result.mode).toBe('reinvest');
  });
});
