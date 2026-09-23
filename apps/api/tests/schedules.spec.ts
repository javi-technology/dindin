const mockOnSchedule = jest.fn(() => jest.fn());

jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: mockOnSchedule,
}));

import '../src/index';

type ScheduleOptions = {
  schedule: string;
  timeZone?: string;
  retryCount?: number;
  secrets?: string[];
  timeoutSeconds?: number;
};

function findScheduleBySchedule(schedule: string): ScheduleOptions {
  const call = mockOnSchedule.mock.calls.find(
    (args) => (args[0] as ScheduleOptions).schedule === schedule,
  );
  if (!call) throw new Error(`Schedule "${schedule}" não registrado`);
  return call[0] as ScheduleOptions;
}

/** Minutos desde a meia-noite de um cron diário `m h * * *`. */
function minutesOfDay(schedule: string): number {
  const [minute, hour] = schedule.split(' ');
  return Number(hour) * 60 + Number(minute);
}

// Fim do after-market da B3 (19:00), no horário de verão dos EUA — o pregão
// contínuo vai até 18:00 e o after-market até 19:00.
const AFTER_MARKET_END = 19 * 60;

// A cadeia diária: cotações → snapshot patrimonial → preço-alvo (issue #388).
// Os dois últimos consomem o preço gravado pelo primeiro, então mover um
// isoladamente faria os de baixo lerem preço do dia anterior.
const DAILY_CHAIN = {
  quotes: '30 19 * * *',
  patrimony: '0 20 * * *',
  targetPrices: '15 20 * * *',
};

describe('Cloud Functions agendadas', () => {
  describe('updateQuotesScheduled', () => {
    const options = () => findScheduleBySchedule(DAILY_CHAIN.quotes);

    it('deve rodar 1x ao dia após o encerramento do after-market, no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });

    it('deve vincular o segredo BRAPI_API_KEY', () => {
      expect(options().secrets).toEqual(['BRAPI_API_KEY']);
    });
  });

  describe('savePatrimonySnapshotsScheduled', () => {
    const options = () => findScheduleBySchedule(DAILY_CHAIN.patrimony);

    it('deve rodar 1x ao dia após as cotações, no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });
  });

  describe('checkTargetPricesScheduled', () => {
    const options = () => findScheduleBySchedule(DAILY_CHAIN.targetPrices);

    it('deve rodar 1x ao dia após cotações e snapshots, no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter timeout maior que o padrão por varrer toda a base', () => {
      expect(options().timeoutSeconds).toBeGreaterThanOrEqual(180);
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });

    it('deve vincular o segredo RESEND_API_KEY para o envio do aviso', () => {
      expect(options().secrets).toEqual(['RESEND_API_KEY']);
    });
  });

  // Os três horários se movem em bloco: atrasar só a cotação faria os outros
  // dois usarem o preço do dia anterior (issue #388).
  describe('cadeia diária de cotações, patrimônio e preço-alvo', () => {
    it('deve rodar toda a cadeia depois do encerramento do after-market', () => {
      for (const schedule of Object.values(DAILY_CHAIN)) {
        findScheduleBySchedule(schedule);
        expect(minutesOfDay(schedule)).toBeGreaterThan(AFTER_MARKET_END);
      }
    });

    it('deve preservar a ordem e os intervalos de 30 e 15 minutos entre os três', () => {
      const quotes = minutesOfDay(DAILY_CHAIN.quotes);
      const patrimony = minutesOfDay(DAILY_CHAIN.patrimony);
      const targetPrices = minutesOfDay(DAILY_CHAIN.targetPrices);

      expect(patrimony - quotes).toBe(30);
      expect(targetPrices - patrimony).toBe(15);
    });
  });

  it('não deve manter os agendamentos diários de madrugada', () => {
    const schedules = mockOnSchedule.mock.calls.map(
      (args) => (args[0] as ScheduleOptions).schedule,
    );
    expect(schedules).not.toContain('0 0 * * *');
    expect(schedules).not.toContain('0 1 * * *');
  });

  it('não deve manter os horários anteriores, dentro do after-market', () => {
    const schedules = mockOnSchedule.mock.calls.map(
      (args) => (args[0] as ScheduleOptions).schedule,
    );
    expect(schedules).not.toContain('30 18 * * *');
    expect(schedules).not.toContain('0 19 * * *');
    expect(schedules).not.toContain('15 19 * * *');
  });

  describe('syncBbWalletScheduled', () => {
    const options = () => findScheduleBySchedule('0 3 1-10 * *');

    it('deve rodar entre os dias 1 e 10 no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve usar retry e recursos adequados para parsear PDFs', () => {
      expect(options().retryCount).toBe(3);
      expect(options()).toMatchObject({
        memory: '512MiB',
        timeoutSeconds: 120,
      });
    });
  });
});
