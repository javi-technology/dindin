import { HttpHeaders } from '@angular/common/http';

/**
 * Tratamento de erro HTTP comum a web e app (issue #505). A matriz completa
 * está em `docs/tratamento-erros-http.md`; o app Flutter implementa as mesmas
 * linhas, com os mesmos textos.
 */

/** Código de contrato do 429 de rate limit (a IA também responde 429, com texto próprio). */
export const RATE_LIMITED = 'RATE_LIMITED';

/** Espera assumida quando a resposta 429 não diz quanto: a janela do rate limit da API. */
export const DEFAULT_WAIT_SECONDS = 60;

export const NETWORK_MESSAGE = 'Sem conexão com o servidor. Tente de novo.';

export const UNAVAILABLE_MESSAGE =
  'O serviço está indisponível no momento. Tente de novo em instantes.';

/** Segundos de espera pedidos pelo `Retry-After`, ou o padrão se ausente ou inválido. */
export function retryAfterSeconds(headers: HttpHeaders): number {
  const seconds = Number(headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : DEFAULT_WAIT_SECONDS;
}

export function rateLimitMessage(seconds: number): string {
  return `Muitas requisições. Aguarde ${seconds} ${
    seconds === 1 ? 'segundo' : 'segundos'
  } e tente de novo.`;
}
