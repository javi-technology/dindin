import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import {
  AdminUser,
  SubscriptionPlan,
  UserSubscription,
} from 'dindin-shared-types';
import {
  isEntitled,
  listEntitlements,
  NO_SUBSCRIPTION,
  repairAbandonedCheckout,
  resolveSubscription,
  subscriptionDoc,
  toPublicSubscription,
  toStripeState,
} from '../../billing/entitlement.service';
import { asyncHandler } from '../../middleware/async-handler';
import { routeParam } from '../../shared/route-params';

const VALID_PLANS: SubscriptionPlan[] = ['basic'];
const LIST_USERS_PAGE_SIZE = 1000;
/** Máximo de usuários por busca — evita ler a assinatura de toda a base. */
export const ADMIN_USERS_LIMIT = 100;
const STRIPE_SUBSCRIPTION_CODE = 'STRIPE_SUBSCRIPTION';

/** `doc` é o documento gravado; a visão exibe o estado efetivo (#171). */
function toAdminUser(user: UserRecord, doc: UserSubscription): AdminUser {
  const isAdmin = user.customClaims?.admin === true;
  const sub = resolveSubscription(doc);
  return {
    uid: user.uid,
    email: user.email ?? null,
    admin: isAdmin,
    subscription: {
      ...toPublicSubscription(sub),
      provider: sub.provider,
      stripeStatus: doc.stripe?.status ?? null,
    },
    entitlements: listEntitlements(sub, isAdmin),
  };
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(LIST_USERS_PAGE_SIZE, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function getSubscriptions(uids: string[]): Promise<UserSubscription[]> {
  if (uids.length === 0) return [];
  const snapshots = await getFirestore().getAll(
    ...uids.map((uid) => subscriptionDoc(uid)),
  );
  return snapshots.map((snapshot) => ({
    ...NO_SUBSCRIPTION,
    ...((snapshot.exists ? snapshot.data() : {}) as Partial<UserSubscription>),
  }));
}

/** Lista usuários do Firebase Auth com o estado de assinatura, filtrando por e-mail. */
export const listUsers = asyncHandler(
  'listUsers',
  async (req: Request, res: Response) => {
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim().toLowerCase()
        : '';
    const users = (await listAllAuthUsers())
      .filter((user) => (user.email ?? '').toLowerCase().includes(search))
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
      .slice(0, ADMIN_USERS_LIMIT);
    const subscriptions = await getSubscriptions(users.map((u) => u.uid));
    res.json(users.map((user, i) => toAdminUser(user, subscriptions[i])));
  },
);

function parseGrantBody(
  body: Record<string, unknown>,
):
  | { error: string }
  | { plan: SubscriptionPlan; currentPeriodEnd: string | null } {
  const { plan, currentPeriodEnd } = body ?? {};
  if (!VALID_PLANS.includes(plan as SubscriptionPlan)) {
    return { error: `plan deve ser um de: ${VALID_PLANS.join(', ')}` };
  }
  if (currentPeriodEnd === null) {
    return { plan: plan as SubscriptionPlan, currentPeriodEnd: null };
  }
  const date =
    typeof currentPeriodEnd === 'string' ? new Date(currentPeriodEnd) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { error: 'currentPeriodEnd deve ser uma data ISO ou null' };
  }
  if (date.getTime() <= Date.now()) {
    return { error: 'currentPeriodEnd deve estar no futuro' };
  }
  return {
    plan: plan as SubscriptionPlan,
    currentPeriodEnd: date.toISOString(),
  };
}

async function findAuthUser(uid: string): Promise<UserRecord | null> {
  try {
    return await getAuth().getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

/** Concede acesso manual (`provider: 'manual'`) a um usuário. */
export const grantSubscription = asyncHandler(
  'grantSubscription',
  async (req: Request, res: Response) => {
    const parsed = parseGrantBody(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const user = await findAuthUser(routeParam(req, 'uid'));
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    // Leitura e gravação na mesma transação: o webhook pode gravar o estado
    // da Stripe entre as duas e não pode ser sobrescrito por um estado antigo.
    const ref = subscriptionDoc(user.uid);
    const result = await getFirestore().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = resolveSubscription({
        ...NO_SUBSCRIPTION,
        ...((snapshot.exists
          ? snapshot.data()
          : {}) as Partial<UserSubscription>),
      });
      if (current.provider === 'stripe' && isEntitled(current, 'ai')) {
        return null;
      }

      const patch: Partial<UserSubscription> = {
        status: 'active',
        plan: parsed.plan,
        interval: null,
        provider: 'manual',
        currentPeriodEnd: parsed.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: new Date().toISOString(),
      };
      // Docs anteriores à #171 guardam a Stripe só no estado principal: preserva
      // esse estado antes que a concessão manual o sobrescreva.
      if (current.provider === 'stripe' && !current.stripe) {
        patch.stripe = toStripeState(current);
      }
      tx.set(ref, patch, { merge: true });
      return { ...current, ...patch };
    });

    if (!result) {
      res.status(409).json({
        error: 'Usuário já tem assinatura ativa na Stripe',
        code: STRIPE_SUBSCRIPTION_CODE,
      });
      return;
    }

    res.json(toAdminUser(user, result));
  },
);

/** Revoga uma concessão manual. Assinaturas Stripe se cancelam pelo portal. */
export const revokeSubscription = asyncHandler(
  'revokeSubscription',
  async (req: Request, res: Response) => {
    const uid = routeParam(req, 'uid');
    const ref = subscriptionDoc(uid);
    // Leitura e gravação na mesma transação: o webhook pode ativar a Stripe
    // entre as duas e a revogação não pode cancelar essa assinatura.
    const result = await getFirestore().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        return { status: 404, error: 'Assinatura não encontrada' } as const;
      }

      const doc: UserSubscription = {
        ...NO_SUBSCRIPTION,
        ...(snapshot.data() as Partial<UserSubscription>),
      };
      const current = repairAbandonedCheckout(doc);
      if (current.provider === 'stripe') {
        return { status: 409 } as const;
      }
      if (current.provider !== 'manual') {
        return {
          status: 404,
          error: 'Assinatura manual não encontrada',
        } as const;
      }

      const patch: Partial<UserSubscription> = {
        status: 'canceled',
        // Corrige no doc o provider trocado por checkout abandonado (#173)
        ...(doc.provider !== current.provider ? { provider: 'manual' } : {}),
        updatedAt: new Date().toISOString(),
      };
      tx.update(ref, patch);
      return { status: 200, subscription: { ...current, ...patch } } as const;
    });

    if (result.status === 409) {
      res.status(409).json({
        error: 'Só assinatura manual pode ser revogada pelo admin',
        code: STRIPE_SUBSCRIPTION_CODE,
      });
      return;
    }
    if (result.status === 404) {
      res.status(404).json({ error: result.error });
      return;
    }

    const user = (await findAuthUser(uid)) ?? ({ uid } as UserRecord);
    res.json(toAdminUser(user, result.subscription));
  },
);
