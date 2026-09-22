import * as functionsLogger from 'firebase-functions/logger';

/**
 * Logger estruturado (issue #324).
 *
 * Antes eram `console.log`/`console.error` com texto livre e campos
 * diferentes em cada ponto, o que impede filtrar por rota, status ou uid no
 * Cloud Logging. O logger do firebase-functions publica os campos como
 * `jsonPayload`, que é consultável.
 */

/** Campos aceitos num log: nada de corpo de requisição (ver `sanitize`). */
export type LogFields = Record<string, unknown>;

/**
 * O corpo da requisição nunca vai para o log: o que trafega aqui é dado
 * financeiro do usuário, e método, rota e uid bastam para localizar a falha
 * (mesma decisão da issue #222, agora garantida em um lugar só).
 */
function sanitize(fields: LogFields): LogFields {
  const { body: _body, ...safe } = fields;
  return safe;
}

export function logInfo(event: string, fields: LogFields = {}): void {
  functionsLogger.info(event, sanitize(fields));
}

export function logWarn(event: string, fields: LogFields = {}): void {
  functionsLogger.warn(event, sanitize(fields));
}

export function logError(event: string, fields: LogFields = {}): void {
  functionsLogger.error(event, sanitize(fields));
}
