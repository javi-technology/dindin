import { MonthlyIncomeItem } from '../../core/services/dividend.service';
import { buildPaymentSchedule } from './payment-schedule.util';

const item = (
  ticker: string,
  monthlyIncome: number,
  paymentDate?: string,
): MonthlyIncomeItem => ({
  ticker,
  quantity: 100,
  monthlyDividend: monthlyIncome / 100,
  monthlyIncome,
  ...(paymentDate && { paymentDate }),
});

// 15/09/2026, meio-dia local — o horário não deve influenciar o resultado.
const hoje = new Date(2026, 8, 15, 12, 0, 0);

describe('buildPaymentSchedule', () => {
  it('deve agrupar os tickers por data de pagamento', () => {
    const agenda = buildPaymentSchedule(
      [
        item('HGLG11', 135, '2026-09-20'),
        item('XPLG11', 35, '2026-09-20'),
        item('MXRF11', 50, '2026-09-25'),
      ],
      hoje,
    );

    expect(agenda.upcoming.length).toBe(2);
    expect(agenda.upcoming[0].date).toBe('2026-09-20');
    expect(agenda.upcoming[0].items.length).toBe(2);
    expect(agenda.upcoming[0].total).toBe(170);
    expect(agenda.upcoming[1].date).toBe('2026-09-25');
  });

  it('deve ordenar as datas da mais próxima para a mais distante', () => {
    const agenda = buildPaymentSchedule(
      [
        item('A', 10, '2026-09-25'),
        item('B', 10, '2026-09-18'),
        item('C', 10, '2026-09-30'),
      ],
      hoje,
    );

    expect(agenda.upcoming.map((dia) => dia.date)).toEqual([
      '2026-09-18',
      '2026-09-25',
      '2026-09-30',
    ]);
  });

  it('deve rotular hoje, amanhã e datas seguintes', () => {
    const agenda = buildPaymentSchedule(
      [
        item('A', 10, '2026-09-15'),
        item('B', 10, '2026-09-16'),
        item('C', 10, '2026-09-18'),
      ],
      hoje,
    );

    expect(agenda.upcoming[0].relativeLabel).toBe('hoje');
    expect(agenda.upcoming[1].relativeLabel).toBe('amanhã');
    expect(agenda.upcoming[2].relativeLabel).toBe('em 3 dias');
  });

  it('deve separar os pagamentos já ocorridos', () => {
    const agenda = buildPaymentSchedule(
      [item('A', 10, '2026-09-10'), item('B', 10, '2026-09-20')],
      hoje,
    );

    expect(agenda.paid.map((dia) => dia.date)).toEqual(['2026-09-10']);
    expect(agenda.upcoming.map((dia) => dia.date)).toEqual(['2026-09-20']);
    expect(agenda.paid[0].relativeLabel).toBe('há 5 dias');
  });

  it('deve considerar o dia do pagamento como ainda a receber', () => {
    const agenda = buildPaymentSchedule([item('A', 10, '2026-09-15')], hoje);

    expect(agenda.upcoming.length).toBe(1);
    expect(agenda.paid.length).toBe(0);
  });

  it('deve listar separadamente os tickers sem data anunciada', () => {
    const agenda = buildPaymentSchedule(
      [item('A', 10, '2026-09-20'), item('SEMDATA11', 25)],
      hoje,
    );

    expect(agenda.withoutDate.map((item) => item.ticker)).toEqual([
      'SEMDATA11',
    ]);
    expect(agenda.upcoming.length).toBe(1);
  });

  it('deve tratar data inválida como sem data anunciada', () => {
    const agenda = buildPaymentSchedule([item('A', 10, '15/09/2026')], hoje);

    expect(agenda.withoutDate.map((item) => item.ticker)).toEqual(['A']);
    expect(agenda.upcoming.length).toBe(0);
  });

  it('deve somar os totais a receber e já pagos', () => {
    const agenda = buildPaymentSchedule(
      [
        item('A', 30, '2026-09-10'),
        item('B', 70, '2026-09-20'),
        item('C', 5, '2026-09-25'),
      ],
      hoje,
    );

    expect(agenda.paidTotal).toBe(30);
    expect(agenda.upcomingTotal).toBe(75);
  });

  it('deve retornar agenda vazia sem itens', () => {
    const agenda = buildPaymentSchedule([], hoje);

    expect(agenda.upcoming).toEqual([]);
    expect(agenda.paid).toEqual([]);
    expect(agenda.withoutDate).toEqual([]);
    expect(agenda.upcomingTotal).toBe(0);
  });
});
