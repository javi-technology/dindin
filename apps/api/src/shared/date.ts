/**
 * Datas do produto, num único lugar (issue #305).
 *
 * As Cloud Functions rodam em UTC e os usuários são brasileiros: entre 21h e
 * a meia-noite de Brasília o servidor já está no dia seguinte. Antes, cada
 * arquivo resolvia isso à sua maneira — `Intl` inline, um helper exportado de
 * `patrimony-snapshot`, `appToday` no limite de renda — e três pontos nem
 * resolviam, usando `toISOString()` direto. O mesmo instante virava dias
 * diferentes conforme a rota, e o ano padrão do relatório mudava na virada do
 * ano em UTC, não na do usuário.
 */

/** Fuso do produto: os usuários são brasileiros, as Functions rodam em UTC. */
export const APP_TIMEZONE = 'America/Sao_Paulo';

/** Partes `YYYY-MM-DD` do instante no fuso do produto. */
function parts(now: Date): [number, number, number] {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);

  return [year, month, day];
}

/** Dia corrente no fuso do produto, como `YYYY-MM-DD`. */
export function today(now: Date = new Date()): string {
  const [year, month, day] = parts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mês corrente no fuso do produto, como `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return today(now).slice(0, 7);
}

/** Ano corrente no fuso do produto. */
export function currentYear(now: Date = new Date()): number {
  return parts(now)[0];
}

/**
 * Meia-noite UTC do dia corrente no fuso do produto, para comparar data com
 * data: um pagamento de hoje não pode cair em "já pagos" enquanto a tela do
 * usuário ainda o lista em "a receber".
 */
export function todayAsUtcDate(now: Date = new Date()): Date {
  const [year, month, day] = parts(now);
  return new Date(Date.UTC(year, month - 1, day));
}
