/**
 * Erro HTTP tipado (issue #304).
 *
 * O `asyncHandler` já traduzia `statusCode` e `expose` em resposta desde a
 * #222, mas a convenção não tinha uma classe: `type StatusError` e
 * `createError` apareciam redefinidos em `ai-suggestion.service`,
 * `suggestion-applied.service` e `stripe.client`, com regras ligeiramente
 * diferentes, e `recommended-wallet.service`/`.controller` montavam o erro
 * inline com `Object.assign`. Cada cópia era uma chance de esquecer o
 * `expose` e vazar detalhe interno, ou de omiti-lo e engolir uma mensagem
 * escrita para o usuário.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  /**
   * Se a mensagem pode ir para o cliente. Por padrão só 4xx expõem: são
   * falhas de negócio escritas para o usuário. Um 5xx só expõe quando a
   * aplicação marca, como o 502 do provedor de IA, cujo texto é de interface.
   */
  readonly expose: boolean;

  constructor(
    message: string,
    statusCode: number,
    { expose }: { expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = expose ?? statusCode < 500;
  }

  /** 400 — dado inválido enviado pelo cliente. */
  static badRequest(message: string): HttpError {
    return new HttpError(message, 400);
  }

  /** 404 — recurso inexistente ou fora do alcance do usuário. */
  static notFound(message: string): HttpError {
    return new HttpError(message, 404);
  }

  /** 409 — a operação conflita com o estado atual do recurso. */
  static conflict(message: string): HttpError {
    return new HttpError(message, 409);
  }

  /** 429 — limite de uso atingido. */
  static tooManyRequests(message: string): HttpError {
    return new HttpError(message, 429);
  }

  /** 502 — falha de serviço externo; a mensagem é texto de interface. */
  static badGateway(message: string): HttpError {
    return new HttpError(message, 502, { expose: true });
  }

  /** 500 — falha interna; a mensagem fica no log, não na resposta. */
  static internal(message: string): HttpError {
    return new HttpError(message, 500);
  }
}
