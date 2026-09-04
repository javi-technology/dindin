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
    const options = () => findScheduleBySchedule('0 0 * * *');

    it('deve rodar 1x ao dia no fuso de São Paulo', () => {
      expect(options().timeZone).toBe('America/Sao_Paulo');
    });

    it('deve ter retry configurado para falhas', () => {
      expect(options().retryCount).toBe(3);
    });

    it('deve vincular o segredo BRAPI_API_KEY', () => {
      expect(options().secrets).toEqual(['BRAPI_API_KEY']);
    });
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
