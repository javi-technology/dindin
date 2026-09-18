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

describe('Cloud Functions agendadas', () => {
  describe('updateQuotesScheduled', () => {
    const options = () => findScheduleBySchedule('30 18 * * *');

    it('deve rodar 1x ao dia às 18:30 (após o fechamento da B3) no fuso de São Paulo', () => {
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
    const options = () => findScheduleBySchedule('0 19 * * *');

    it('deve rodar 1x ao dia às 19:00 (após as cotações) no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });
  });

  describe('checkTargetPricesScheduled', () => {
    const options = () => findScheduleBySchedule('15 19 * * *');

    it('deve rodar 1x ao dia às 19:15 (após cotações e snapshots) no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter timeout maior que o padrão por varrer toda a base', () => {
      expect(options().timeoutSeconds).toBeGreaterThanOrEqual(180);
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });
  });

  it('não deve manter os agendamentos diários de madrugada', () => {
    const schedules = mockOnSchedule.mock.calls.map(
      (args) => (args[0] as ScheduleOptions).schedule,
    );
    expect(schedules).not.toContain('0 0 * * *');
    expect(schedules).not.toContain('0 1 * * *');
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
