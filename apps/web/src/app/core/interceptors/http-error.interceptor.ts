import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import {
  NETWORK_MESSAGE,
  RATE_LIMITED,
  UNAVAILABLE_MESSAGE,
  rateLimitMessage,
  retryAfterSeconds,
} from '../http/http-errors';
import { RateLimitNoticeService } from '../services/rate-limit-notice.service';

/** Mesma resposta de erro, com o corpo trocado. */
function withBody(error: HttpErrorResponse, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({
    error: body,
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined,
  });
}

function messageOf(error: HttpErrorResponse): string | undefined {
  const message = error.error?.error;
  return typeof message === 'string' ? message : undefined;
}

/**
 * Normaliza os erros HTTP que não são de uma tela só (issue #505): sem rede,
 * 429 de rate limit e indisponibilidade. A matriz está em
 * `docs/tratamento-erros-http.md` e o app Flutter implementa as mesmas linhas.
 *
 * Fica na ponta do pipeline, depois do `unauthorizedInterceptor`: o 401 e o
 * 403 `SUBSCRIPTION_REQUIRED` já foram tratados lá.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const notice = inject(RateLimitNoticeService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        return throwError(() => withBody(error, { error: NETWORK_MESSAGE }));
      }

      // O rate limit é por IP e vale para toda rota `/api/*`: o usuário pode
      // recebê-lo em qualquer tela, por isso o aviso é global. O 429 de
      // negócio (limite diário da IA) tem texto próprio e fica com a tela.
      if (error.status === 429 && error.error?.code === RATE_LIMITED) {
        const seconds = retryAfterSeconds(error.headers);
        notice.show(seconds);
        return throwError(() =>
          withBody(error, {
            error: rateLimitMessage(seconds),
            code: RATE_LIMITED,
          }),
        );
      }

      if (error.status >= 502 && !messageOf(error)) {
        return throwError(() =>
          withBody(error, { error: UNAVAILABLE_MESSAGE }),
        );
      }

      return throwError(() => error);
    }),
  );
};
