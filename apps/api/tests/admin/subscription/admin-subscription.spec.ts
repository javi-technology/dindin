import request from 'supertest';
import { UserSubscription } from 'dindin-shared-types';

const verifyIdTokenMock = jest.fn();
const listUsersMock = jest.fn();
const getUserMock = jest.fn();
const setMock = jest.fn();
const updateMock = jest.fn();

/** Documentos `users/{uid}/billing/subscription` em memória. */
let subscriptions: Map<string, Partial<UserSubscription>>;

function subscriptionRef(uid: string) {
  return {
    uid,
    get: jest.fn(async () => snapshotOf(uid)),
    set: (data: unknown, options: unknown) => setMock(uid, data, options),
    update: (data: unknown) => updateMock(uid, data),
  };
}

function snapshotOf(uid: string) {
  const data = subscriptions.get(uid);
  return { exists: data !== undefined, data: () => data };
}

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
    listUsers: listUsersMock,
    getUser: getUserMock,
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn((uid: string) => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => subscriptionRef(uid)),
        })),
      })),
    })),
    getAll: jest.fn(async (...refs: Array<{ uid: string }>) =>
      refs.map((ref) => snapshotOf(ref.uid)),
    ),
  })),
  storage: jest.fn(),
}));

import { app } from '../../../src/index';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function authUser(uid: string, email?: string, admin = false) {
  return { uid, email, customClaims: admin ? { admin: true } : undefined };
}

function asAdmin() {
  verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });
}

function asUser() {
  verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
}

describe('admin – assinaturas de usuários', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscriptions = new Map();
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    getUserMock.mockImplementation(async (uid: string) =>
      authUser(uid, `${uid}@dindin.app`),
    );
    listUsersMock.mockResolvedValue({ users: [], pageToken: undefined });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('permissões', () => {
    it.each([
      ['get', '/api/admin/users'],
      ['put', '/api/admin/users/user-2/subscription'],
      ['delete', '/api/admin/users/user-2/subscription'],
    ] as const)(
      'deve responder 403 para não-admin em %s %s',
      async (method, path) => {
        asUser();

        const response = await request(app)
          [method](path)
          .send({ plan: 'basic', currentPeriodEnd: null })
          .set('Authorization', 'Bearer token');

        expect(response.status).toBe(403);
        expect(listUsersMock).not.toHaveBeenCalled();
        expect(setMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('GET /api/admin/users', () => {
    beforeEach(asAdmin);

    it('deve listar usuários com o estado de assinatura, ordenados por e-mail', async () => {
      listUsersMock.mockResolvedValue({
        users: [
          authUser('u-b', 'bruna@dindin.app'),
          authUser('u-a', 'ana@dindin.app', true),
        ],
      });
      subscriptions.set('u-b', {
        status: 'active',
        plan: 'basic',
        interval: null,
        provider: 'manual',
        providerCustomerId: 'cus_9',
        currentPeriodEnd: FUTURE,
        cancelAtPeriodEnd: false,
        updatedAt: '2026-09-01T00:00:00.000Z',
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          uid: 'u-a',
          email: 'ana@dindin.app',
          admin: true,
          subscription: {
            status: 'none',
            plan: null,
            interval: null,
            provider: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          },
          entitlements: ['ai'],
        },
        {
          uid: 'u-b',
          email: 'bruna@dindin.app',
          admin: false,
          subscription: {
            status: 'active',
            plan: 'basic',
            interval: null,
            provider: 'manual',
            currentPeriodEnd: FUTURE,
            cancelAtPeriodEnd: false,
          },
          entitlements: ['ai'],
        },
      ]);
      expect(JSON.stringify(response.body)).not.toContain('cus_9');
    });

    it('deve indicar concessão manual expirada sem entitlement', async () => {
      listUsersMock.mockResolvedValue({
        users: [authUser('u-1', 'u1@dindin.app')],
      });
      subscriptions.set('u-1', {
        status: 'active',
        plan: 'basic',
        provider: 'manual',
        currentPeriodEnd: PAST,
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(response.body[0].subscription.status).toBe('active');
      expect(response.body[0].entitlements).toEqual([]);
    });

    it('deve filtrar por e-mail sem diferenciar maiúsculas', async () => {
      listUsersMock.mockResolvedValue({
        users: [
          authUser('u-1', 'Ana.Silva@dindin.app'),
          authUser('u-2', 'bruno@dindin.app'),
          authUser('u-3'),
        ],
      });

      const response = await request(app)
        .get('/api/admin/users')
        .query({ search: ' ANA ' })
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.map((u: { uid: string }) => u.uid)).toEqual(['u-1']);
    });

    it('deve percorrer todas as páginas do Firebase Auth', async () => {
      listUsersMock
        .mockResolvedValueOnce({
          users: [authUser('u-1', 'a@dindin.app')],
          pageToken: 'next',
        })
        .mockResolvedValueOnce({ users: [authUser('u-2', 'b@dindin.app')] });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(listUsersMock).toHaveBeenNthCalledWith(1, 1000, undefined);
      expect(listUsersMock).toHaveBeenNthCalledWith(2, 1000, 'next');
      expect(response.body).toHaveLength(2);
    });

    it('deve limitar a resposta aos primeiros 100 usuários por e-mail', async () => {
      listUsersMock.mockResolvedValue({
        users: Array.from({ length: 150 }, (_, i) =>
          authUser(`u-${i}`, `user${String(i).padStart(3, '0')}@dindin.app`),
        ),
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(100);
      expect(response.body[0].email).toBe('user000@dindin.app');
      expect(response.body[99].email).toBe('user099@dindin.app');
    });

    it('deve devolver lista vazia sem consultar assinaturas', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('deve responder 500 quando o Firebase Auth falha', async () => {
      listUsersMock.mockRejectedValue(new Error('boom'));

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('PUT /api/admin/users/:uid/subscription', () => {
    beforeEach(asAdmin);

    function grant(body: unknown, uid = 'user-2') {
      return request(app)
        .put(`/api/admin/users/${uid}/subscription`)
        .send(body as object)
        .set('Authorization', 'Bearer token');
    }

    it('deve conceder acesso manual com validade', async () => {
      const response = await grant({ plan: 'basic', currentPeriodEnd: FUTURE });

      expect(response.status).toBe(200);
      expect(setMock).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({
          status: 'active',
          plan: 'basic',
          interval: null,
          provider: 'manual',
          currentPeriodEnd: FUTURE,
          cancelAtPeriodEnd: false,
          updatedAt: expect.any(String),
        }),
        { merge: true },
      );
      expect(response.body).toEqual({
        uid: 'user-2',
        email: 'user-2@dindin.app',
        admin: false,
        subscription: {
          status: 'active',
          plan: 'basic',
          interval: null,
          provider: 'manual',
          currentPeriodEnd: FUTURE,
          cancelAtPeriodEnd: false,
        },
        entitlements: ['ai'],
      });
    });

    it('deve conceder acesso manual sem validade', async () => {
      const response = await grant({ plan: 'basic', currentPeriodEnd: null });

      expect(response.status).toBe(200);
      expect(setMock).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({ provider: 'manual', currentPeriodEnd: null }),
        { merge: true },
      );
    });

    it('deve normalizar currentPeriodEnd para ISO', async () => {
      const response = await grant({
        plan: 'basic',
        currentPeriodEnd: '2099-12-31T23:59:59-03:00',
      });

      expect(response.status).toBe(200);
      expect(setMock).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({
          currentPeriodEnd: '2100-01-01T02:59:59.000Z',
        }),
        { merge: true },
      );
    });

    it.each([
      ['plano inválido', { plan: 'premium', currentPeriodEnd: null }],
      ['sem plano', { currentPeriodEnd: null }],
      ['sem currentPeriodEnd', { plan: 'basic' }],
      ['data inválida', { plan: 'basic', currentPeriodEnd: 'amanhã' }],
      ['data no passado', { plan: 'basic', currentPeriodEnd: PAST }],
    ])('deve responder 400 com %s', async (_label, body) => {
      const response = await grant(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
      expect(setMock).not.toHaveBeenCalled();
    });

    it.each(['active', 'trialing'])(
      'deve responder 409 para assinatura Stripe %s',
      async (status) => {
        subscriptions.set('user-2', {
          status: status as UserSubscription['status'],
          plan: 'basic',
          interval: 'month',
          provider: 'stripe',
          currentPeriodEnd: FUTURE,
        });

        const response = await grant({ plan: 'basic', currentPeriodEnd: null });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: expect.any(String),
          code: 'STRIPE_SUBSCRIPTION',
        });
        expect(setMock).not.toHaveBeenCalled();
      },
    );

    it('deve conceder acesso quando a assinatura Stripe foi cancelada', async () => {
      subscriptions.set('user-2', {
        status: 'canceled',
        plan: 'basic',
        interval: 'month',
        provider: 'stripe',
        currentPeriodEnd: PAST,
      });

      const response = await grant({ plan: 'basic', currentPeriodEnd: null });

      expect(response.status).toBe(200);
      expect(setMock).toHaveBeenCalled();
    });

    it('deve responder 404 quando o usuário não existe', async () => {
      getUserMock.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'auth/user-not-found' }),
      );

      const response = await grant({ plan: 'basic', currentPeriodEnd: null });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
      expect(setMock).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/users/:uid/subscription', () => {
    beforeEach(asAdmin);

    function revoke(uid = 'user-2') {
      return request(app)
        .delete(`/api/admin/users/${uid}/subscription`)
        .set('Authorization', 'Bearer token');
    }

    it('deve revogar concessão manual', async () => {
      subscriptions.set('user-2', {
        status: 'active',
        plan: 'basic',
        interval: null,
        provider: 'manual',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: '2026-09-01T00:00:00.000Z',
      });

      const response = await revoke();

      expect(response.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith('user-2', {
        status: 'canceled',
        updatedAt: expect.any(String),
      });
      expect(response.body.subscription.status).toBe('canceled');
      expect(response.body.entitlements).toEqual([]);
    });

    it('deve responder 409 para assinatura Stripe', async () => {
      subscriptions.set('user-2', {
        status: 'active',
        plan: 'basic',
        interval: 'month',
        provider: 'stripe',
      });

      const response = await revoke();

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: expect.any(String),
        code: 'STRIPE_SUBSCRIPTION',
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando não há concessão manual', async () => {
      subscriptions.set('user-2', { status: 'none', provider: null });

      const response = await revoke();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Manual subscription not found' });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('deve responder 404 sem documento de assinatura', async () => {
      const response = await revoke();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Subscription not found' });
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
