import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
  firestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';
import { Fridge, FridgeItem, Wallet } from 'dindin-models';

/* ---------- Helpers de mock ---------- */

function createFridgeSnapshot(fridge: Fridge) {
  return {
    id: fridge.id,
    exists: true,
    data: () => ({ ...fridge }),
  };
}

function createFridgeItemSnapshot(item: FridgeItem) {
  return {
    id: item.id,
    exists: true,
    data: () => ({ ...item }),
    ref: {
      id: item.id,
      path: `users/user-123/fridges/${item.fridgeId}/fridgeItems/${item.id}`,
    },
  };
}

/**
 * Cria stubs simples para as collections `assets` e `quotes`, usadas para
 * validar o ticker no cadastro e resolver `currentPrice` na leitura.
 * Por padrão, `HGLG11` é um ativo ativo com cotação igual à de
 * `baseItem.currentPrice`, o que preserva o comportamento dos testes
 * existentes que comparam o corpo da resposta com o fixture completo.
 */
function createCatalogStubs(
  activeTickers: string[] = ['HGLG11'],
  pricesByTicker: Record<string, number> = { HGLG11: 100.0 },
) {
  const assetsCollection = {
    doc: jest.fn((ticker: string) => ({
      get: jest.fn().mockResolvedValue({
        exists: activeTickers.includes(ticker),
        data: () =>
          activeTickers.includes(ticker) ? { ticker, active: true } : undefined,
      }),
    })),
  };

  const quotesCollection = {
    doc: jest.fn((ticker: string) => ({
      get: jest.fn().mockResolvedValue(
        pricesByTicker[ticker] !== undefined
          ? {
              exists: true,
              data: () => ({ ticker, price: pricesByTicker[ticker] }),
            }
          : { exists: false, data: () => undefined },
      ),
    })),
  };

  return { assetsCollection, quotesCollection };
}

function createFirestoreMock(
  fridges: Fridge[] = [],
  items: FridgeItem[] = [],
  catalog = createCatalogStubs(),
  wallets: Wallet[] = [],
) {
  const fridgeMap = new Map<string, any>();
  const itemMap = new Map<string, any>();
  const walletMap = new Map<string, any>();
  const batchOperations: unknown[][] = [];

  wallets.forEach((wallet) => {
    walletMap.set(wallet.id, {
      id: wallet.id,
      collection: jest.fn((path: string) => {
        if (path !== 'positions') {
          throw new Error(`Unexpected subcollection: ${path}`);
        }
        return {
          doc: jest.fn(() => ({ id: 'new-position-id' })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        id: wallet.id,
        exists: true,
        data: () => ({ ...wallet }),
      }),
    });
  });

  fridges.forEach((fridge) => {
    let data = { ...fridge };
    fridgeMap.set(fridge.id, {
      id: fridge.id,
      get: jest
        .fn()
        .mockImplementation(() => Promise.resolve(createFridgeSnapshot(data))),
      set: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    });
  });

  items.forEach((item) => {
    let data = { ...item };
    itemMap.set(item.id, {
      id: item.id,
      get: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createFridgeItemSnapshot(data)),
        ),
      set: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    });
  });

  function getFridgesSnapshot() {
    return {
      docs: fridges.map((fridge) => createFridgeSnapshot(fridge)),
      empty: fridges.length === 0,
      forEach: (cb: any) =>
        fridges.forEach((fridge) => cb(createFridgeSnapshot(fridge))),
    };
  }

  function getItemsSnapshot() {
    return {
      docs: items.map((item) => createFridgeItemSnapshot(item)),
      empty: items.length === 0,
      forEach: (cb: any) =>
        items.forEach((item) => cb(createFridgeItemSnapshot(item))),
    };
  }

  const fridgesCollection = {
    doc: jest.fn((id: string) => {
      if (!fridgeMap.has(id)) {
        return {
          id,
          exists: false,
          data: () => null,
          get: jest
            .fn()
            .mockResolvedValue({ id, exists: false, data: () => null }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
          delete: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
        };
      }
      return fridgeMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-fridge-id' }),
    get: jest.fn().mockResolvedValue(getFridgesSnapshot()),
  };

  const itemsCollection = {
    doc: jest.fn((id: string) => {
      if (!itemMap.has(id)) {
        return {
          id,
          exists: false,
          data: () => null,
          get: jest
            .fn()
            .mockResolvedValue({ id, exists: false, data: () => null }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
          delete: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
        };
      }
      return itemMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-item-id' }),
    get: jest.fn().mockResolvedValue(getItemsSnapshot()),
  };

  const batchMock = {
    delete: jest.fn((ref: unknown) => {
      batchOperations.push(['delete', ref]);
      return batchMock;
    }),
    set: jest.fn((ref: unknown, value: unknown) => {
      batchOperations.push(['set', ref, value]);
      return batchMock;
    }),
    commit: jest.fn().mockResolvedValue(undefined),
    operations: batchOperations,
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets' && uid === 'user-123') {
                return {
                  doc: jest.fn((walletId: string) => {
                    if (walletMap.has(walletId)) return walletMap.get(walletId);
                    return {
                      id: walletId,
                      get: jest.fn().mockResolvedValue({
                        id: walletId,
                        exists: false,
                        data: () => null,
                      }),
                    };
                  }),
                };
              }
              if (subPath === 'fridges' && uid === 'user-123') {
                // Combina operações de fridge + navegação para items
                const fridgeDoc = (fridgeId: string) => {
                  const base = fridgeMap.has(fridgeId)
                    ? fridgeMap.get(fridgeId)
                    : {
                        id: fridgeId,
                        exists: false,
                        data: () => null,
                        get: jest.fn().mockResolvedValue({
                          id: fridgeId,
                          exists: false,
                          data: () => null,
                        }),
                        set: jest.fn().mockResolvedValue(undefined),
                        update: jest
                          .fn()
                          .mockRejectedValue(
                            new Error('Document does not exist'),
                          ),
                        delete: jest
                          .fn()
                          .mockRejectedValue(
                            new Error('Document does not exist'),
                          ),
                      };
                  return {
                    ...base,
                    collection: jest.fn((itemPath: string) => {
                      if (
                        itemPath === 'fridgeItems' &&
                        fridgeId === 'fridge-1'
                      ) {
                        return itemsCollection;
                      }
                      throw new Error(`Unexpected subcollection: ${itemPath}`);
                    }),
                  };
                };
                return {
                  doc: jest.fn((id: string) => fridgeDoc(id)),
                  add: fridgesCollection.add,
                  get: fridgesCollection.get,
                };
              }
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }),
          })),
        };
      }
      if (path === 'assets') return catalog.assetsCollection;
      if (path === 'quotes') return catalog.quotesCollection;
      throw new Error(`Unexpected collection: ${path}`);
    }),
    batch: jest.fn(() => batchMock),
    batchMock,
  };
}

function createFailingFirestoreMock() {
  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
          add: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              get: jest
                .fn()
                .mockRejectedValue(new Error('Firestore unavailable')),
              add: jest
                .fn()
                .mockRejectedValue(new Error('Firestore unavailable')),
              doc: jest.fn(() => ({
                get: jest
                  .fn()
                  .mockRejectedValue(new Error('Firestore unavailable')),
                update: jest
                  .fn()
                  .mockRejectedValue(new Error('Firestore unavailable')),
                delete: jest
                  .fn()
                  .mockRejectedValue(new Error('Firestore unavailable')),
              })),
            })),
            get: jest
              .fn()
              .mockRejectedValue(new Error('Firestore unavailable')),
            update: jest
              .fn()
              .mockRejectedValue(new Error('Firestore unavailable')),
            delete: jest
              .fn()
              .mockRejectedValue(new Error('Firestore unavailable')),
          })),
        })),
      })),
    })),
    batch: jest.fn(() => ({
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
    })),
  };
}

/* ---------- Testes ---------- */

describe('Fridge CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const baseFridge: Fridge = {
    id: 'fridge-1',
    ownerId: 'user-123',
    name: 'Geladeira Principal',
    description: 'FIIs aguardando valorização',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  describe('GET /api/fridges', () => {
    it('deve listar as geladeiras do usuário autenticado', async () => {
      firestoreMock = createFirestoreMock([baseFridge]);

      const response = await request(app)
        .get('/api/fridges')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([baseFridge]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get('/api/fridges');

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/fridges')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/fridges', () => {
    it('deve criar uma geladeira com dados válidos', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/fridges')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Geladeira', description: 'Oportunidades' });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-fridge-id');
      expect(response.body.ownerId).toBe('user-123');
      expect(response.body.name).toBe('Nova Geladeira');
      expect(response.body.description).toBe('Oportunidades');
    });

    it('deve criar uma geladeira sem description', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/fridges')
        .set('Authorization', authHeader)
        .send({ name: 'Geladeira Simples' });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe('');
    });

    it('deve retornar 400 quando name não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/fridges')
        .set('Authorization', authHeader)
        .send({ description: 'Sem nome' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/fridges')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Geladeira' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/fridges/:id', () => {
    it('deve retornar uma geladeira existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge]);

      const response = await request(app)
        .get('/api/fridges/fridge-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseFridge);
    });

    it('deve retornar 404 para geladeira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .get('/api/fridges/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/fridges/fridge-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/fridges/:id', () => {
    it('deve atualizar uma geladeira existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge]);

      const response = await request(app)
        .put('/api/fridges/fridge-1')
        .set('Authorization', authHeader)
        .send({ name: 'Geladeira Atualizada' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Geladeira Atualizada');
      expect(response.body.id).toBe('fridge-1');
    });

    it('deve retornar 404 para geladeira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .put('/api/fridges/inexistente')
        .set('Authorization', authHeader)
        .send({ name: 'Nova' });

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .put('/api/fridges/fridge-1')
        .set('Authorization', authHeader)
        .send({ name: 'Nova' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/fridges/:id', () => {
    it('deve remover uma geladeira existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge]);

      const response = await request(app)
        .delete('/api/fridges/fridge-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
    });

    it('deve remover os itens da geladeira em cascata ao deletar', async () => {
      const item: FridgeItem = {
        id: 'item-1',
        fridgeId: 'fridge-1',
        ticker: 'HGLG11',
        quantity: 5,
        transferredPrice: 95.0,
        targetPrice: 110.0,
        currentPrice: 100.0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      firestoreMock = createFirestoreMock([baseFridge], [item]);

      const response = await request(app)
        .delete('/api/fridges/fridge-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
      // O batch deve ter sido chamado para deletar itens + a geladeira
      const batch = (firestoreMock as any).batch();
      expect(batch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1' }),
      );
      expect(batch.commit).toHaveBeenCalled();
    });

    it('deve retornar 404 para geladeira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .delete('/api/fridges/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .delete('/api/fridges/fridge-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});

describe('FridgeItem CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const baseFridge: Fridge = {
    id: 'fridge-1',
    ownerId: 'user-123',
    name: 'Geladeira Principal',
    description: 'FIIs aguardando valorização',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const baseItem: FridgeItem = {
    id: 'item-1',
    fridgeId: 'fridge-1',
    ticker: 'HGLG11',
    quantity: 5,
    transferredPrice: 95.0,
    targetPrice: 110.0,
    currentPrice: 100.0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const baseWallet: Wallet = {
    id: 'wallet-1',
    ownerId: 'user-123',
    name: 'Carteira Principal',
    currency: 'BRL',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  describe('GET /api/fridges/:fridgeId/items', () => {
    it('deve listar os itens de uma geladeira', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .get('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([baseItem]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app).get('/api/fridges/fridge-1/items');

      expect(response.status).toBe(401);
    });

    it('deve retornar 404 quando a geladeira não existe', async () => {
      firestoreMock = createFirestoreMock([], [baseItem]);

      const response = await request(app)
        .get('/api/fridges/fridge-inexistente/items')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Fridge not found');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('deve resolver currentPrice a partir da collection quotes, não do valor gravado no item', async () => {
      const staleStoredPrice = { ...baseItem, currentPrice: 999 };
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [staleStoredPrice],
        createCatalogStubs(['HGLG11'], { HGLG11: 150.75 }),
      );

      const response = await request(app)
        .get('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body[0].currentPrice).toBe(150.75);
    });
  });

  describe('POST /api/fridges/:fridgeId/items', () => {
    it('deve criar um item com dados válidos', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-item-id');
      expect(response.body.fridgeId).toBe('fridge-1');
      expect(response.body.ticker).toBe('HGLG11');
      expect(response.body.quantity).toBe(5);
      expect(response.body.transferredPrice).toBe(95.0);
      expect(response.body.targetPrice).toBe(110.0);
    });

    it('deve ignorar currentPrice enviado no corpo da requisição', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
          currentPrice: 999,
        });

      expect(response.status).toBe(201);
      expect(response.body.currentPrice).toBeUndefined();
    });

    it('deve retornar 400 quando o ticker não existe no catálogo de ativos', async () => {
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [],
        createCatalogStubs(['HGLG11']),
      );

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'INEXISTENTE11',
          quantity: 5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('catálogo');
    });

    it('deve retornar 400 quando ticker não é informado', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({ quantity: 5, transferredPrice: 95.0, targetPrice: 110.0 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando quantity não é informada', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({ ticker: 'HGLG11', transferredPrice: 95.0, targetPrice: 110.0 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando quantity não é um número positivo', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: -5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando transferredPrice não é informado', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({ ticker: 'HGLG11', quantity: 5, targetPrice: 110.0 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando targetPrice não é informado', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({ ticker: 'HGLG11', quantity: 5, transferredPrice: 95.0 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 404 quando a geladeira não existe', async () => {
      firestoreMock = createFirestoreMock([], []);

      const response = await request(app)
        .post('/api/fridges/fridge-inexistente/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Fridge not found');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/fridges/fridge-1/items')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 5,
          transferredPrice: 95.0,
          targetPrice: 110.0,
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/fridges/:fridgeId/items/:id', () => {
    it('deve retornar um item existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .get('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseItem);
    });

    it('deve retornar 404 para item inexistente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .get('/api/fridges/fridge-1/items/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 404 quando a geladeira não existe', async () => {
      firestoreMock = createFirestoreMock([], [baseItem]);

      const response = await request(app)
        .get('/api/fridges/fridge-inexistente/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Fridge not found');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/fridges/:fridgeId/items/:id', () => {
    it('deve atualizar um item existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: 10, targetPrice: 115.0 });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(10);
      expect(response.body.targetPrice).toBe(115.0);
      expect(response.body.id).toBe('item-1');
    });

    it('deve retornar o estado real persistido após atualização', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: 10, targetPrice: 115.0 });

      expect(response.status).toBe(200);
      // O estado retornado deve refletir o pós-update, não o pré-update
      expect(response.body.quantity).toBe(10);
      expect(response.body.targetPrice).toBe(115.0);
      // Campos não atualizados devem preservar o valor original
      expect(response.body.ticker).toBe('HGLG11');
      expect(response.body.transferredPrice).toBe(95.0);
    });

    it('deve retornar currentPrice resolvido a partir da collection quotes, não o valor gravado', async () => {
      const staleStoredPrice = { ...baseItem, currentPrice: 999 };
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [staleStoredPrice],
        createCatalogStubs(['HGLG11'], { HGLG11: 150.75 }),
      );

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: 10 });

      expect(response.status).toBe(200);
      expect(response.body.currentPrice).toBe(150.75);
    });

    it('deve retornar 400 quando o novo ticker não existe no catálogo de ativos', async () => {
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [baseItem],
        createCatalogStubs(['HGLG11']),
      );

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ ticker: 'INEXISTENTE11' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('catálogo');
    });

    it('deve retornar 404 para item inexistente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/inexistente')
        .set('Authorization', authHeader)
        .send({ quantity: 10 });

      expect(response.status).toBe(404);
    });

    it('deve retornar 404 quando a geladeira não existe', async () => {
      firestoreMock = createFirestoreMock([], [baseItem]);

      const response = await request(app)
        .put('/api/fridges/fridge-inexistente/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: 10 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Fridge not found');
    });

    it('deve retornar 400 para quantity inválida na atualização', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: -1 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando ticker é apenas espaços na atualização', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ ticker: '   ' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .put('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader)
        .send({ quantity: 10 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/fridges/:fridgeId/items/:id', () => {
    it('deve remover um item existente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .delete('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
    });

    it('deve retornar 404 para item inexistente', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .delete('/api/fridges/fridge-1/items/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 404 quando a geladeira não existe', async () => {
      firestoreMock = createFirestoreMock([], [baseItem]);

      const response = await request(app)
        .delete('/api/fridges/fridge-inexistente/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Fridge not found');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .delete('/api/fridges/fridge-1/items/item-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/fridges/:fridgeId/items/:id/unfreeze', () => {
    it('deve mover item da geladeira para uma carteira atomicamente', async () => {
      const item = { ...baseItem, assetType: 'FII' as const };
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [item],
        createCatalogStubs(),
        [baseWallet],
      );

      const response = await request(app)
        .post('/api/fridges/fridge-1/items/item-1/unfreeze')
        .set('Authorization', authHeader)
        .send({ walletId: 'wallet-1' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: 'new-position-id',
          walletId: 'wallet-1',
          ticker: 'HGLG11',
          assetType: 'FII',
          quantity: 5,
          averagePrice: 95,
          inFridge: false,
        }),
      );

      const batch = firestoreMock.batchMock;
      expect(batch.operations[0][0]).toBe('delete');
      expect(batch.operations[1][0]).toBe('set');
      expect(batch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1' }),
      );
      expect(batch.set).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-position-id' }),
        expect.objectContaining({
          walletId: 'wallet-1',
          averagePrice: 95,
          inFridge: false,
        }),
      );
    });

    it('deve retornar 400 quando walletId não é informado', async () => {
      firestoreMock = createFirestoreMock([baseFridge], [baseItem]);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items/item-1/unfreeze')
        .set('Authorization', authHeader)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'walletId is required' });
    });

    it('deve retornar 404 quando o item não existe', async () => {
      firestoreMock = createFirestoreMock([baseFridge], []);

      const response = await request(app)
        .post('/api/fridges/fridge-1/items/item-1/unfreeze')
        .set('Authorization', authHeader)
        .send({ walletId: 'wallet-1' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Fridge item not found' });
    });

    it('deve retornar 404 quando a carteira não existe', async () => {
      firestoreMock = createFirestoreMock(
        [baseFridge],
        [baseItem],
        createCatalogStubs(),
        [],
      );

      const response = await request(app)
        .post('/api/fridges/fridge-1/items/item-1/unfreeze')
        .set('Authorization', authHeader)
        .send({ walletId: 'wallet-inexistente' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Wallet not found' });
    });
  });
});
