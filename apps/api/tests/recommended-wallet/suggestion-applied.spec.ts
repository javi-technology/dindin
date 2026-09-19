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

// Firestore em memória só com o que a aplicação usa: documentos por caminho,
// consulta por igualdade e transações serializadas, como o Admin SDK garante.
// Leitura e escrita só existem dentro da transação.
jest.mock('firebase-admin/firestore', () => {
  let autoId = 0;
  const docRef = (path: string): unknown => ({
    kind: 'doc',
    path,
    id: path.split('/').pop(),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (
    path: string,
    filters: [string, unknown][] = [],
    max = Infinity,
  ): unknown => ({
    kind: 'query',
    path,
    filters,
    max,
    doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++autoId}`}`),
    where: (field: string, _op: string, value: unknown) =>
      collectionRef(path, [...filters, [field, value]], max),
    limit: (count: number) => collectionRef(path, filters, count),
  });
  type Ref = {
    kind: 'doc' | 'query';
    path: string;
    id: string;
    filters: [string, unknown][];
    max: number;
  };
  let lock: Promise<unknown> = Promise.resolve();
  const firestore = {
    collection: (name: string) => collectionRef(name),
    runTransaction: (
      callback: (tx: unknown) => Promise<unknown>,
    ): Promise<unknown> => {
      const run = lock.then(async () => {
        const writes: (() => void)[] = [];
        const tx = {
          get: async (ref: Ref) => {
            await Promise.resolve();
            if (ref.kind === 'doc') {
              const data = docs.get(ref.path);
              return {
                id: ref.id,
                ref,
                exists: data !== undefined,
                data: () => data,
              };
            }
            const prefix = `${ref.path}/`;
            const found = [...docs.entries()]
              .filter(
                ([key, data]) =>
                  key.startsWith(prefix) &&
                  !key.slice(prefix.length).includes('/') &&
                  ref.filters.every(([field, value]) => data[field] === value),
              )
              .slice(0, ref.max)
              .map(([key, data]) => ({
                id: key.slice(prefix.length),
                ref: docRef(key),
                data: () => data,
              }));
            return { empty: found.length === 0, docs: found };
          },
          update: (ref: Ref, data: Record<string, unknown>) => {
            writes.push(() =>
              docs.set(ref.path, { ...docs.get(ref.path), ...data }),
            );
          },
          create: (ref: Ref, data: Record<string, unknown>) => {
            writes.push(() => docs.set(ref.path, { ...data }));
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

const POSITION_PATH = `users/${UID}/wallets/wallet-1/positions/pos-1`;
const positions = () =>
  [...docs.entries()].filter(([key]) =>
    key.startsWith(`users/${UID}/wallets/wallet-1/positions/`),
  );

const apply = (body: object, id = SUGGESTION_ID) =>
  request(app)
    .post(`/api/recommended-wallets/bb-fii/suggestions/${id}/applied`)
    .set('Authorization', 'Bearer token')
    .send(body);

describe('POST /api/recommended-wallets/bb-fii/suggestions/:id/applied (#276)', () => {
  beforeEach(() => {
    docs = new Map();
    docs.set(path(), suggestion());
    docs.set(`users/${UID}/wallets/wallet-1`, { name: 'Principal' });
    docs.set(POSITION_PATH, {
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 2,
      averagePrice: 100,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    for (const ticker of ['HGLG11', 'KNIP11', 'VISC11']) {
      docs.set(`assets/${ticker}`, { ticker, assetType: 'FII', active: true });
    }
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

  describe('lançamento na carteira', () => {
    it('deve atualizar a posição existente com o preço médio ponderado', async () => {
      const response = await apply({
        ticker: 'HGLG11',
        quantity: 1,
        price: 95,
      });

      expect(response.status).toBe(200);
      // 2 cotas a R$ 100 + 1 a R$ 95 → 3 cotas a R$ 98,33.
      expect(docs.get(POSITION_PATH)).toEqual(
        expect.objectContaining({
          quantity: 3,
          averagePrice: 98.33,
          updatedAt: expect.not.stringMatching('2026-01-01T00:00:00Z'),
        }),
      );
      expect(positions()).toHaveLength(1);
    });

    it('deve criar a posição da alternativa com o tipo do catálogo', async () => {
      const response = await apply({
        ticker: 'KNIP11',
        fallbackFor: 'RBRR11',
        quantity: 2,
        price: 89.2,
      });

      expect(response.status).toBe(200);
      const created = positions().find(
        ([, data]) => data['ticker'] === 'KNIP11',
      );
      expect(created?.[1]).toEqual({
        walletId: 'wallet-1',
        ticker: 'KNIP11',
        assetType: 'FII',
        quantity: 2,
        averagePrice: 89.2,
        inFridge: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('deve recusar ativo fora do catálogo sem marcar nem criar posição', async () => {
      docs.delete('assets/VISC11');

      const response = await apply({
        ticker: 'VISC11',
        quantity: 1,
        price: 99,
      });

      expect(response.status).toBe(400);
      expect(positions()).toHaveLength(1);
      expect(docs.get(path())?.['appliedItems']).toBeUndefined();
    });

    it('não deve mexer na carteira quando o item já foi aplicado', async () => {
      await apply({ ticker: 'HGLG11', quantity: 1, price: 95 });

      const response = await apply({
        ticker: 'HGLG11',
        quantity: 1,
        price: 95,
      });

      expect(response.status).toBe(409);
      expect(docs.get(POSITION_PATH)?.['quantity']).toBe(3);
    });

    it('deve lançar a compra uma única vez com pedidos simultâneos', async () => {
      await Promise.all([
        apply({ ticker: 'HGLG11', quantity: 1, price: 95 }),
        apply({ ticker: 'HGLG11', quantity: 1, price: 95 }),
      ]);

      expect(docs.get(POSITION_PATH)?.['quantity']).toBe(3);
    });

    it('deve retornar 404 quando a carteira da sugestão não existe mais', async () => {
      docs.delete(`users/${UID}/wallets/wallet-1`);

      const response = await apply({
        ticker: 'HGLG11',
        quantity: 1,
        price: 95,
      });

      expect(response.status).toBe(404);
      expect(docs.get(POSITION_PATH)?.['quantity']).toBe(2);
    });
  });
});
