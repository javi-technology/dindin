import { HttpError } from '../shared/http-error';

/**
 * Chave única da cobrança (issue #594). O DinDin é ferramenta gratuita: sem
 * `BILLING_ENABLED=true`, todo usuário logado recebe todos os entitlements e
 * nenhuma assinatura nova é aberta. A integração com a Stripe e com as lojas
 * continua no código para religar por configuração.
 *
 * Ausente vale desligado de propósito: o deploy escreve o `.env` das
 * Functions só com as variáveis que conhece, e esquecer a chave não pode
 * voltar a cobrar ninguém.
 */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true';
}

/** Recusa abrir assinatura nova com a cobrança desligada. */
export function assertBillingEnabled(): void {
  if (isBillingEnabled()) return;
  throw HttpError.conflict(
    'A assinatura está desativada: todos os recursos estão liberados',
    { code: 'BILLING_DISABLED' },
  );
}
