import request from 'supertest';
import { AiSuggestion } from 'dindin-models';

const verifyIdTokenMock = jest.fn();

let docs: Map<string, Record<string, unknown>>;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

jest.mock('../../src/billing/entitlement.service', () => ({
  hasEntitlement: jest.fn().mockResolvedValue(true),
}));

// Firestore em memória só com o que a marcação usa: documentos por caminho e
// transações serializadas, como o Admin SDK garante.
jest.mock('firebase-admin/firestore', () => {
  const docRef = (path: string): unknown => ({
    path,
    id: path.split('/').pop(),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string): unknown => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  let lock: Promise<unknown> = Promise.resolve();
  const firestore = {
    collection: (name: string) => collectionRef(name),
    runTransaction: (
      callback: (tx: unknown) => Promise<unknown>,
    ): Promise<unknown> => {
      const run = lock.then(async () => {
        const writes: (() => void)[] = [];
        const tx = {
          get: async (ref: { path: string; id: string }) => {
            await Promise.resolve();
            const data = docs.get(ref.path);
            return { id: ref.id, exists: data !== undefined, data: () => data };
          },
          update: (ref: { path: string }, data: Record<string, unknown>) => {
            writes.push(() =>
              docs.set(ref.path, { ...docs.get(ref.path), ...data }),
            );
          },
        };
        const result = await callback(tx);
        writes.forEach((write) => write());
        return result;
      });
      lock = run.catch(() => undefined);
      return run;
    },
  };
  return {
    ...jest.requireActual('firebase-admin/firestore'),
    getFirestore: jest.fn(() => firestore),
  };
});

import { app } from '../../src/index';

const UID = 'user-1';
const SUGGESTION_ID = 'wallet-1_2026-09_renda';
const path = (uid = UID) => `users/${uid}/aiSuggestions/${SUGGESTION_ID}`;

function suggestion(): AiSuggestion & { input: unknown } {
  return {
    id: SUGGESTION_ID,
    walletId: 'wallet-1',
    month: '2026-09',
    tab: 'renda',
    model: 'modelo',
    summary: 'Resumo',
    disclaimer: 'Aviso',
    createdAt: '2026-09-18T00:00:00Z',
    items: [
      {
        ticker: 'HGLG11',
        action: 'buy',
        priority: 1,
        rationale: 'Compre.',
        suggestedAmount: 320,
        suggestedQuantity: 2,
        referencePrice: 160,
      },
      {
        ticker: 'RBRR11',
        action: 'buy',
        priority: 2,
        rationale: 'Exclusivo para qualificado.',
        suggestedAmount: 200,
        suggestedQuantity: 2,
        referencePrice: 90,
        qualifiedInvestor: true,
        fallbackAllocations: [
          {
            ticker: 'KNIP11',
            amount: 100,
            suggestedQuantity: 1,
            referencePrice: 89.2,
          },
          {
            ticker: 'VISC11',
            amount: 100,
            suggestedQuantity: 1,
            referencePrice: 99,
          },
        ],
      },
      {
        ticker: 'VISC11',
        action: 'buy',
        priority: 3,
        rationale: 'Compre.',
        suggestedAmount: 99,
        suggestedQuantity: 1,
        referencePrice: 99,
      },
      {
        ticker: 'XPML11',
        action: 'hold',
        priority: 4,
        rationale: 'Mantenha.',
      },
    ],
    input: { items: [] },
  };
}

const apply = (body: object, id = SUGGESTION_ID) =>
  request(app)
    .post(`/api/recommended-wallets/bb-fii/suggestions/${id}/applied`)
    .set('Authorization', 'Bearer token')
    .send(body);

describe('POST /api/recommended-wallets/bb-fii/suggestions/:id/applied (#276)', () => {
  beforeEach(() => {
    docs = new Map();
    docs.set(path(), suggestion());
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: UID });
  });

  it('deve registrar o item aplicado e devolver a sugestão atualizada', async () => {
    const response = await apply({
      ticker: 'HGLG11',
      quantity: 3,
      price: 158.5,
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('input');
    expect(response.body.appliedItems).toEqual([
      {
        ticker: 'HGLG11',
        quantity: 3,
        price: 158.5,
        appliedAt: expect.any(String),
      },
    ]);
    expect(docs.get(path())?.['appliedItems']).toEqual(
      response.body.appliedItems,
    );
  });

  it('deve registrar a alternativa de redistribuição com o FII de origem', async () => {
    const response = await apply({
      ticker: 'KNIP11',
      fallbackFor: 'RBRR11',
      quantity: 2,
      price: 89.2,
    });

    expect(response.status).toBe(200);
    expect(response.body.appliedItems).toEqual([
      expect.objectContaining({ ticker: 'KNIP11', fallbackFor: 'RBRR11' }),
    ]);
  });

  it('deve retornar 404 para sugestão de outro usuário', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-2' });

    const response = await apply({ ticker: 'HGLG11', quantity: 1, price: 1 });

    expect(response.status).toBe(404);
    expect(docs.has(path('user-2'))).toBe(false);
  });

  it('deve retornar 404 para sugestão inexistente', async () => {
    const response = await apply(
      { ticker: 'HGLG11', quantity: 1, price: 1 },
      'outra',
    );

    expect(response.status).toBe(404);
  });

  it.each([
    ['ticker fora da sugestão', { ticker: 'MXRF11', quantity: 1, price: 1 }],
    ['item que não é compra', { ticker: 'XPML11', quantity: 1, price: 1 }],
    [
      'alternativa de outro FII',
      { ticker: 'KNIP11', fallbackFor: 'HGLG11', quantity: 1, price: 1 },
    ],
    [
      'alternativa usada como item próprio',
      { ticker: 'KNIP11', quantity: 1, price: 1 },
    ],
    ['quantidade zero', { ticker: 'HGLG11', quantity: 0, price: 1 }],
    ['preço negativo', { ticker: 'HGLG11', quantity: 1, price: -1 }],
    ['preço em texto', { ticker: 'HGLG11', quantity: 1, price: '89,20' }],
  ])('deve retornar 400 para %s', async (_label, body) => {
    const response = await apply(body);

    expect(response.status).toBe(400);
    expect(docs.get(path())?.['appliedItems']).toBeUndefined();
  });

  it('deve retornar 409 para item já aplicado', async () => {
    await apply({ ticker: 'HGLG11', quantity: 3, price: 158.5 });

    const response = await apply({ ticker: 'hglg11', quantity: 1, price: 1 });

    expect(response.status).toBe(409);
    expect(docs.get(path())?.['appliedItems']).toHaveLength(1);
  });

  it('deve registrar uma única vez com pedidos simultâneos', async () => {
    const responses = await Promise.all([
      apply({ ticker: 'HGLG11', quantity: 3, price: 158.5 }),
      apply({ ticker: 'HGLG11', quantity: 3, price: 158.5 }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(docs.get(path())?.['appliedItems']).toHaveLength(1);
  });

  it('deve permitir aplicar o mesmo ticker como item e como alternativa', async () => {
    const asFallback = await apply({
      ticker: 'VISC11',
      fallbackFor: 'RBRR11',
      quantity: 1,
      price: 99,
    });
    const asItem = await apply({ ticker: 'VISC11', quantity: 1, price: 99 });

    expect(asFallback.status).toBe(200);
    expect(asItem.status).toBe(200);
    expect(docs.get(path())?.['appliedItems']).toHaveLength(2);
  });
});
