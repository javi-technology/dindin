import {
  APP_TIMEZONE,
  currentMonth,
  currentYear,
  today,
  todayAsUtcDate,
} from '../../src/shared/date';

// ---------------------------------------------------------------------------
// Datas do produto (issue #305)
// As Functions rodam em UTC e os usuários são brasileiros: entre 21h e a
// meia-noite de Brasília, o UTC já está no dia seguinte. Antes cada arquivo
// resolvia isso à sua maneira — ou não resolvia, usando `toISOString()` —, o
// que fazia o mesmo instante virar dias diferentes conforme a rota.
// ---------------------------------------------------------------------------

describe('shared/date', () => {
  it('usa o fuso do produto', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  describe('today', () => {
    it('devolve o dia em Brasília, não em UTC', () => {
      // 21h30 em Brasília = 00h30 do dia seguinte em UTC
      expect(today(new Date('2026-09-03T00:30:00Z'))).toBe('2026-09-02');
    });

    it('vira o dia à meia-noite de Brasília', () => {
      expect(today(new Date('2026-09-03T02:59:00Z'))).toBe('2026-09-02');
      expect(today(new Date('2026-09-03T03:00:00Z'))).toBe('2026-09-03');
    });

    it('usa o instante atual por padrão', () => {
      expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('currentMonth', () => {
    it('devolve o mês em Brasília', () => {
      expect(currentMonth(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09');
      expect(currentMonth(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10');
    });
  });

  describe('currentYear', () => {
    it('devolve o ano em Brasília', () => {
      // 31/12 às 22h em Brasília ainda é o ano corrente, mesmo já sendo
      // 1º de janeiro em UTC.
      expect(currentYear(new Date('2027-01-01T01:00:00Z'))).toBe(2026);
      expect(currentYear(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
    });
  });

  describe('todayAsUtcDate', () => {
    it('devolve a meia-noite UTC do dia corrente em Brasília', () => {
      expect(
        todayAsUtcDate(new Date('2026-09-18T01:00:00Z')).toISOString(),
      ).toBe('2026-09-17T00:00:00.000Z');
      expect(
        todayAsUtcDate(new Date('2026-09-17T12:00:00Z')).toISOString(),
      ).toBe('2026-09-17T00:00:00.000Z');
    });
  });
});
