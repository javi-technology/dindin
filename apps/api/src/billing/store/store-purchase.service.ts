import { getFirestore } from 'firebase-admin/firestore';
import {
  PublicSubscription,
  SubscriptionInterval,
  UserSubscription,
} from 'dindin-shared-types';
import {
  storeSubscriptionDocument,
  subscriptionDocument,
} from '../../firestore/paths';
import { NO_SUBSCRIPTION, toPublicSubscription } from '../entitlement.service';
import { isInForce } from '../checkout-session.service';
import { logInfo, logWarn } from '../../shared/logger';
import { StoreBillingError } from './store-errors';
import {
  getStoreValidator,
  InvalidReceiptError,
  StorePlatform,
  StoreSubscriptionInfo,
} from './store-validators';

export { StoreBillingError } from './store-errors';

/**
 * Produtos vendidos nas lojas: o mesmo plano da web, com ids idênticos nas
 * duas (docs/publicacao-lojas.md). Um id fora daqui nunca chega a virar
 * entitlement.
 */
const PRODUCTS: Record<string, SubscriptionInterval> = {
  dindin_basic_monthly: 'month',
  dindin_basic_yearly: 'year',
};

/**
 * O evento da loja chega em milissegundos, mas `providerEventCreated` é
 * comparado pelo webhook da Stripe em segundos: gravar milissegundos faria
 * todo evento da Stripe parecer antigo.
 */
function eventSeconds(info: StoreSubscriptionInfo): number {
  return Math.floor(info.eventTime / 1000);
}

const IN_FORCE_STATUS = ['active', 'trialing', 'past_due'];

function toSubscription(
  platform: StorePlatform,
  interval: SubscriptionInterval,
  info: StoreSubscriptionInfo,
): UserSubscription {
  return {
    status: info.status,
    plan: 'basic',
    interval,
    provider: platform,
    providerSubscriptionId: info.originalId,
    providerEventCreated: eventSeconds(info),
    currentPeriodEnd: info.currentPeriodEnd,
    cancelAtPeriodEnd: info.cancelAtPeriodEnd,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Valida o recibo com a loja e só então concede a assinatura. Serve também à
 * restauração de compra em aparelho novo: o mesmo recibo, do mesmo usuário,
 * apenas regrava o estado.
 */
export async function registerStorePurchase(input: {
  uid: string;
  platform: StorePlatform;
  productId: string;
  credential: string;
}): Promise<PublicSubscription> {
  const { uid, platform, productId, credential } = input;
  const interval = PRODUCTS[productId];
  if (!interval) {
    throw new StoreBillingError('Produto desconhecido', 400, 'UNKNOWN_PRODUCT');
  }

  const validator = getStoreValidator(platform);
  let info: StoreSubscriptionInfo;
  try {
    info = await validator.validate({ productId, credential });
  } catch (error) {
    if (error instanceof InvalidReceiptError) {
      throw new StoreBillingError('Recibo inválido', 400, 'INVALID_RECEIPT');
    }
    throw error;
  }
  if (info.productId !== productId) {
    throw new StoreBillingError('Recibo inválido', 400, 'INVALID_RECEIPT');
  }

  const subscription = toSubscription(platform, interval, info);
  const subRef = subscriptionDocument(uid);
  const linkRef = storeSubscriptionDocument(platform, info.originalId);

  let kept: UserSubscription | undefined;
  await getFirestore().runTransaction(async (tx) => {
    kept = undefined;
    const [subSnap, linkSnap] = await Promise.all([
      tx.get(subRef),
      tx.get(linkRef),
    ]);

    const owner = (linkSnap.data() as { uid?: string } | undefined)?.uid;
    if (owner && owner !== uid) {
      throw new StoreBillingError(
        'Esta compra já está vinculada a outra conta',
        409,
        'RECEIPT_ALREADY_USED',
      );
    }

    const current = subSnap.data() as UserSubscription | undefined;
    if (current && current.provider !== platform && isInForce(current)) {
      throw new StoreBillingError(
        'Assinatura já ativa',
        409,
        'ALREADY_SUBSCRIBED',
      );
    }

    // Recibo de outra compra da mesma loja (restaurar um mensal antigo depois
    // de assinar o anual): só vale se estiver em vigor e for mais novo. Um
    // recibo cancelado não pode derrubar o plano ativo.
    const supersedes =
      !!current &&
      current.provider === platform &&
      !!current.providerSubscriptionId &&
      current.providerSubscriptionId !== info.originalId &&
      isInForce(current) &&
      !(
        IN_FORCE_STATUS.includes(info.status) &&
        eventSeconds(info) > (current.providerEventCreated ?? 0)
      );

    tx.set(linkRef, { uid, platform, updatedAt: subscription.updatedAt });
    if (supersedes) {
      kept = { ...NO_SUBSCRIPTION, ...current };
      return;
    }
    tx.set(subRef, subscription, { merge: true });
  });

  // Sem o recibo nem o id da compra: bastam usuário, loja e o estado.
  const result = kept ?? subscription;
  logInfo('billing.store.purchase', {
    uid,
    platform,
    productId,
    status: result.status,
    kept: kept !== undefined,
  });
  return toPublicSubscription(result);
}

/**
 * Aplica ao entitlement uma transição vinda da loja (renovação, recusa,
 * cancelamento, reembolso). A notificação chega já autenticada pelo
 * controller; aqui só se decide se ela ainda vale.
 */
export async function applyStoreNotification(input: {
  platform: StorePlatform;
  originalId: string;
  info: StoreSubscriptionInfo;
}): Promise<void> {
  const { platform, originalId, info } = input;
  const linkRef = storeSubscriptionDocument(platform, originalId);

  await getFirestore().runTransaction(async (tx) => {
    const linkSnap = await tx.get(linkRef);
    const uid = (linkSnap.data() as { uid?: string } | undefined)?.uid;
    if (!uid) {
      logWarn('billing.store.unknownPurchase', { platform });
      return;
    }

    const subRef = subscriptionDocument(uid);
    const current = (await tx.get(subRef)).data() as
      UserSubscription | undefined;

    if (current && current.provider !== platform && isInForce(current)) {
      logWarn('billing.store.otherProviderKept', { uid, platform });
      return;
    }
    // Notificação de uma compra antiga não pode mexer na assinatura que já
    // vale por outra compra.
    if (
      current?.providerSubscriptionId &&
      current.providerSubscriptionId !== originalId &&
      isInForce(current)
    ) {
      logWarn('billing.store.supersededPurchase', { uid, platform });
      return;
    }
    if (
      typeof current?.providerEventCreated === 'number' &&
      current.providerEventCreated > eventSeconds(info)
    ) {
      logWarn('billing.store.staleEvent', { uid, platform });
      return;
    }

    const interval = PRODUCTS[info.productId] ?? current?.interval ?? 'month';
    const next = toSubscription(platform, interval, info);
    tx.set(subRef, next, { merge: true });
    logInfo('billing.store.transition', {
      uid,
      platform,
      from: current?.status ?? 'none',
      to: next.status,
    });
  });
}
