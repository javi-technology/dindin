import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { UserRecord } from 'firebase-admin/auth';
import {
  AdminUser,
  SubscriptionPlan,
  UserSubscription,
} from 'dindin-shared-types';
import {
  listEntitlements,
  NO_SUBSCRIPTION,
  subscriptionDoc,
  toPublicSubscription,
} from '../../billing/entitlement.service';

const VALID_PLANS: SubscriptionPlan[] = ['basic'];
const LIST_USERS_PAGE_SIZE = 1000;

function toAdminUser(user: UserRecord, sub: UserSubscription): AdminUser {
  const isAdmin = user.customClaims?.admin === true;
  return {
    uid: user.uid,
    email: user.email ?? null,
    admin: isAdmin,
    subscription: { ...toPublicSubscription(sub), provider: sub.provider },
    entitlements: listEntitlements(sub, isAdmin),
  };
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await admin.auth().listUsers(LIST_USERS_PAGE_SIZE, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function getSubscriptions(uids: string[]): Promise<UserSubscription[]> {
  if (uids.length === 0) return [];
  const snapshots = await admin
    .firestore()
    .getAll(...uids.map((uid) => subscriptionDoc(uid)));
  return snapshots.map((snapshot) => ({
    ...NO_SUBSCRIPTION,
    ...((snapshot.exists ? snapshot.data() : {}) as Partial<UserSubscription>),
  }));
}

/** Lista usuários do Firebase Auth com o estado de assinatura, filtrando por e-mail. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim().toLowerCase()
        : '';
    const users = (await listAllAuthUsers())
      .filter((user) => (user.email ?? '').toLowerCase().includes(search))
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
    const subscriptions = await getSubscriptions(users.map((u) => u.uid));
    res.json(users.map((user, i) => toAdminUser(user, subscriptions[i])));
  } catch (error) {
    console.error('[admin.listUsers] error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

function parseGrantBody(
  body: Record<string, unknown>,
):
  | { error: string }
  | { plan: SubscriptionPlan; currentPeriodEnd: string | null } {
  const { plan, currentPeriodEnd } = body ?? {};
  if (!VALID_PLANS.includes(plan as SubscriptionPlan)) {
    return { error: `plan must be one of: ${VALID_PLANS.join(', ')}` };
  }
  if (currentPeriodEnd === null) {
    return { plan: plan as SubscriptionPlan, currentPeriodEnd: null };
  }
  const date =
    typeof currentPeriodEnd === 'string' ? new Date(currentPeriodEnd) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { error: 'currentPeriodEnd must be an ISO date or null' };
  }
  if (date.getTime() <= Date.now()) {
    return { error: 'currentPeriodEnd must be in the future' };
  }
  return {
    plan: plan as SubscriptionPlan,
    currentPeriodEnd: date.toISOString(),
  };
}

async function findAuthUser(uid: string): Promise<UserRecord | null> {
  try {
    return await admin.auth().getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

/** Concede acesso manual (`provider: 'manual'`) a um usuário. */
export async function grantSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const parsed = parseGrantBody(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const user = await findAuthUser(req.params.uid);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
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
    await subscriptionDoc(user.uid).set(patch, { merge: true });

    res.json(toAdminUser(user, { ...NO_SUBSCRIPTION, ...patch }));
  } catch (error) {
    console.error('[admin.grantSubscription] error:', {
      uid: req.params.uid,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** Revoga uma concessão manual. Assinaturas Stripe se cancelam pelo portal. */
export async function revokeSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { uid } = req.params;
    const ref = subscriptionDoc(uid);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    const current: UserSubscription = {
      ...NO_SUBSCRIPTION,
      ...(snapshot.data() as Partial<UserSubscription>),
    };
    if (current.provider !== 'manual') {
      res.status(409).json({
        error: 'Only manual subscriptions can be revoked by an admin',
        code: 'STRIPE_SUBSCRIPTION',
      });
      return;
    }

    const patch = {
      status: 'canceled' as const,
      updatedAt: new Date().toISOString(),
    };
    await ref.update(patch);

    const user = (await findAuthUser(uid)) ?? ({ uid } as UserRecord);
    res.json(toAdminUser(user, { ...current, ...patch }));
  } catch (error) {
    console.error('[admin.revokeSubscription] error:', {
      uid: req.params.uid,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
