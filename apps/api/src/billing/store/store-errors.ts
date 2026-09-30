import { HttpError } from '../../shared/http-error';

/**
 * Falha de negócio da compra na loja (issue #405). Além do status, carrega o
 * `code` de contrato que o app usa para escolher a mensagem: o `asyncHandler`
 * só devolve `error`, então o controller repassa o `code`.
 */
export class StoreBillingError extends HttpError {
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message, statusCode);
    this.name = 'StoreBillingError';
    this.code = code;
  }
}
