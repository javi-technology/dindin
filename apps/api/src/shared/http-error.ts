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
    { expose, cause }: { expose?: boolean; cause?: unknown } = {},
  ) {
    // `cause` guarda o erro que originou este: converter um erro capturado
    // sem ele jogaria fora o stack de quem falhou de verdade, e o log do
    // `asyncHandler` apontaria para a linha da conversão.
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = expose ?? statusCode < 500;
  }

  /** 400 — dado inválido enviado pelo cliente. */
  static badRequest(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 400, options);
  }

  /** 404 — recurso inexistente ou fora do alcance do usuário. */
  static notFound(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 404, options);
  }

  /** 409 — a operação conflita com o estado atual do recurso. */
  static conflict(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 409, options);
  }

  /** 429 — limite de uso atingido. */
  static tooManyRequests(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 429, options);
  }

  /** 502 — falha de serviço externo; a mensagem é texto de interface. */
  static badGateway(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 502, { ...options, expose: true });
  }

  /** 500 — falha interna; a mensagem fica no log, não na resposta. */
  static internal(
    message: string,
    options: { cause?: unknown } = {},
  ): HttpError {
    return new HttpError(message, 500, options);
  }
}
