import type { SubscriptionStatus } from 'dindin-shared-types';
import { StoreBillingError } from './store-errors';

export type StorePlatform = 'apple' | 'google';

/** Estado da assinatura já validado com a loja, normalizado entre as duas. */
export interface StoreSubscriptionInfo {
  status: SubscriptionStatus;
  productId: string;
  /** Id que se mantém nas renovações (`originalTransactionId` / `purchaseToken`). */
  originalId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Instante do evento na loja, em ms; protege contra notificação fora de ordem. */
  eventTime: number;
}

/** O recibo foi recusado pela loja: falso, de outro app ou de outro ambiente. */
export class InvalidReceiptError extends Error {
  constructor(message = 'Recibo inválido') {
    super(message);
    this.name = 'InvalidReceiptError';
  }
}

export interface StoreValidator {
  validate(input: {
    productId: string;
    credential: string;
  }): Promise<StoreSubscriptionInfo>;
}

const validators: Partial<Record<StorePlatform, StoreValidator>> = {};

/** Registra o validador de uma loja (ligado na inicialização, com a credencial). */
export function registerStoreValidator(
  platform: StorePlatform,
  validator: StoreValidator,
): void {
  validators[platform] = validator;
}

/**
 * Sem validador configurado a compra é **recusada**, nunca aceita: liberar
 * acesso pelo que o app afirma é exatamente o que a issue #405 proíbe.
 */
export function getStoreValidator(platform: StorePlatform): StoreValidator {
  const validator = validators[platform];
  if (!validator) {
    throw new StoreBillingError(
      'Compra pela loja indisponível no momento',
      503,
      'STORE_NOT_CONFIGURED',
    );
  }
  return validator;
}

/** A notificação não veio da loja: assinatura, emissor ou ambiente não conferem. */
export class InvalidNotificationError extends Error {
  constructor(message = 'Notificação inválida') {
    super(message);
    this.name = 'InvalidNotificationError';
  }
}

export interface StoreNotification {
  originalId: string;
  info: StoreSubscriptionInfo;
}

/**
 * Autentica e normaliza a notificação de servidor da loja (JWS da Apple,
 * Pub/Sub do Google). Devolve `null` para tipos que não mudam o acesso.
 */
export interface StoreNotificationVerifier {
  verify(req: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<StoreNotification | null>;
}

const verifiers: Partial<Record<StorePlatform, StoreNotificationVerifier>> = {};

export function registerStoreNotificationVerifier(
  platform: StorePlatform,
  verifier: StoreNotificationVerifier,
): void {
  verifiers[platform] = verifier;
}

/** Sem verificador a notificação é recusada: nunca se confia no corpo cru. */
export function getStoreNotificationVerifier(
  platform: StorePlatform,
): StoreNotificationVerifier {
  const verifier = verifiers[platform];
  if (!verifier) {
    throw new StoreBillingError(
      'Notificações da loja indisponíveis no momento',
      503,
      'STORE_NOT_CONFIGURED',
    );
  }
  return verifier;
}
