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

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: jest.fn(() => '__DELETE_SENTINEL__'),
  },
}));

import { app } from '../../src/index';
import { Position, AssetType, Fridge } from 'dindin-models';

function createPositionSnapshot(position: Position) {
  return {
    id: position.id,
    exists: true,
    data: () => ({ ...position }),
  };
}

function createFridgeSnapshot(fridge: Fridge) {
  return {
    id: fridge.id,
    exists: true,
    data: () => ({ ...fridge }),
  };
}

/**
 * Cria stubs simples para as collections `assets` e `quotes`, usadas para
 * validar o ticker no cadastro e resolver `currentPrice` na leitura.
 * Por padrão, `HGLG11` é um ativo ativo com cotação igual à de
 * `basePosition.currentPrice`, o que preserva o comportamento dos testes
 * existentes que comparam o corpo da resposta com o fixture completo.
 */
function createCatalogStubs(
  activeTickers: string[] = ['HGLG11'],
  pricesByTicker: Record<string, number> = { HGLG11: 112.0 },
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
  positions: Position[] = [],
  catalog = createCatalogStubs(),
) {
  const positionMap = new Map<string, any>();

  positions.forEach((position) => {
    let data = { ...position };
    positionMap.set(position.id, {
      id: position.id,
      get: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createPositionSnapshot(data)),
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

  function getPositionsSnapshot() {
    return {
      docs: positions.map((position: Position) =>
        createPositionSnapshot(position),
      ),
      empty: positions.length === 0,
      forEach: (callback: any) => {
        positions.forEach((position) =>
          callback(createPositionSnapshot(position)),
        );
      },
    };
  }

  const positionsCollection = {
    doc: jest.fn((id: string) => {
      if (!positionMap.has(id)) {
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
      return positionMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-position-id' }),
    get: jest.fn().mockResolvedValue(getPositionsSnapshot()),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets' && uid === 'user-123') {
                return {
                  doc: jest.fn((walletId: string) => ({
                    collection: jest.fn((positionPath: string) => {
                      if (
                        positionPath === 'positions' &&
                        walletId === 'wallet-1'
                      ) {
                        return positionsCollection;
                      }
                      throw new Error(
                        `Unexpected subcollection: ${positionPath}`,
                      );
                    }),
                  })),
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
  };
}

function createFailingFirestoreMock() {
  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
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
          })),
        })),
      })),
    })),
  };
}

/**
 * Cria mock do Firestore com suporte a positions, fridges e batch.
 * Usado nos testes de moveToFridge.
 */
function createFirestoreMockWithFridge(
  positions: Position[] = [],
  fridges: Fridge[] = [],
  catalog = createCatalogStubs(),
) {
  const positionMap = new Map<string, any>();
  const fridgeMap = new Map<string, any>();

  positions.forEach((position) => {
    let data = { ...position };
    positionMap.set(position.id, {
      id: position.id,
      ref: { id: position.id, path: `positions/${position.id}` },
      get: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createPositionSnapshot(data)),
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

  const positionsCollection = {
    doc: jest.fn((id: string) => {
      if (!positionMap.has(id)) {
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
      return positionMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-position-id' }),
    get: jest.fn().mockResolvedValue({
      docs: positions.map((p) => createPositionSnapshot(p)),
      empty: positions.length === 0,
    }),
  };

  const fridgeItemsCollection = {
    doc: jest.fn(() => ({
      id: 'new-fridge-item-id',
      set: jest.fn().mockResolvedValue(undefined),
    })),
  };

  const batchOperations: Array<{
    type: 'delete' | 'set';
    ref: any;
    data?: any;
  }> = [];
  const batchMock: {
    delete: jest.Mock;
    set: jest.Mock;
    commit: jest.Mock;
    _operations: typeof batchOperations;
  } = {
    delete: jest.fn((ref: any) => {
      batchOperations.push({ type: 'delete', ref });
      return batchMock;
    }),
    set: jest.fn((ref: any, data: any) => {
      batchOperations.push({ type: 'set', ref, data });
      return batchMock;
    }),
    commit: jest.fn().mockResolvedValue(undefined),
    _operations: batchOperations,
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets' && uid === 'user-123') {
                return {
                  doc: jest.fn((walletId: string) => ({
                    collection: jest.fn((positionPath: string) => {
                      if (
                        positionPath === 'positions' &&
                        walletId === 'wallet-1'
                      ) {
                        return positionsCollection;
                      }
                      throw new Error(
                        `Unexpected subcollection: ${positionPath}`,
                      );
                    }),
                  })),
                };
              }
              if (subPath === 'fridges' && uid === 'user-123') {
                return {
                  doc: jest.fn((fridgeId: string) => {
                    if (!fridgeMap.has(fridgeId)) {
                      return {
                        id: fridgeId,
                        exists: false,
                        data: () => null,
                        get: jest.fn().mockResolvedValue({
                          id: fridgeId,
                          exists: false,
                          data: () => null,
                        }),
                        collection: jest.fn(() => fridgeItemsCollection),
                      };
                    }
                    const fridge = fridgeMap.get(fridgeId);
                    return {
                      ...fridge,
                      collection: jest.fn(() => fridgeItemsCollection),
                    };
                  }),
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
    _batch: batchMock,
  };
}

describe('Position CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const basePosition: Position = {
    id: 'position-1',
    walletId: 'wallet-1',
    ticker: 'HGLG11',
    assetType: 'FII' as AssetType,
    quantity: 10,
    averagePrice: 110.5,
    currentPrice: 112.0,
    inFridge: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  describe('GET /api/wallets/:walletId/positions', () => {
    it('deve listar as posições de uma carteira', async () => {
      firestoreMock = createFirestoreMock([basePosition]);

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([basePosition]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get(
        '/api/wallets/wallet-1/positions',
      );

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('deve resolver currentPrice a partir da collection quotes, não do valor gravado na posição', async () => {
      const staleStoredPrice = { ...basePosition, currentPrice: 999 };
      firestoreMock = createFirestoreMock(
        [staleStoredPrice],
        createCatalogStubs(['HGLG11'], { HGLG11: 150.75 }),
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body[0].currentPrice).toBe(150.75);
    });
  });

  describe('POST /api/wallets/:walletId/positions', () => {
    it('deve criar uma posição com dados válidos', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 10,
          averagePrice: 110.5,
          assetType: 'FII',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-position-id');
      expect(response.body.walletId).toBe('wallet-1');
      expect(response.body.ticker).toBe('HGLG11');
      expect(response.body.quantity).toBe(10);
      expect(response.body.averagePrice).toBe(110.5);
      expect(response.body.assetType).toBe('FII');
    });

    it('deve criar uma posição sem currentPrice', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 10,
          averagePrice: 110.5,
          assetType: 'FII',
          currentPrice: undefined,
        });

      expect(response.status).toBe(201);
      expect(response.body.currentPrice).toBeUndefined();
    });

    it('deve retornar 400 quando ticker não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({ quantity: 10, averagePrice: 110.5, assetType: 'FII' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando quantity não é informada', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({ ticker: 'HGLG11', averagePrice: 110.5, assetType: 'FII' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando quantity não é um número positivo', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: -5,
          averagePrice: 110.5,
          assetType: 'FII',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 10,
          averagePrice: 110.5,
          assetType: 'FII',
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar 400 quando o ticker não existe no catálogo de ativos', async () => {
      firestoreMock = createFirestoreMock([], createCatalogStubs(['HGLG11']));

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'INEXISTENTE11',
          quantity: 10,
          averagePrice: 110.5,
          assetType: 'FII',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('catálogo');
    });

    it('deve ignorar currentPrice enviado no corpo da requisição', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          quantity: 10,
          averagePrice: 110.5,
          assetType: 'FII',
          currentPrice: 999,
        });

      expect(response.status).toBe(201);
      expect(response.body.currentPrice).toBeUndefined();
    });
  });

  describe('GET /api/wallets/:walletId/positions/:id', () => {
    it('deve retornar uma posição existente', async () => {
      firestoreMock = createFirestoreMock([basePosition]);

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(basePosition);
    });

    it('deve retornar 404 para posição inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/wallets/:walletId/positions/:id', () => {
    it('deve atualizar uma posição existente', async () => {
      firestoreMock = createFirestoreMock([basePosition]);

      const response = await request(app)
        .put('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader)
        .send({ quantity: 20 });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(20);
      expect(response.body.id).toBe('position-1');
    });

    it('deve retornar 404 para posição inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .put('/api/wallets/wallet-1/positions/inexistente')
        .set('Authorization', authHeader)
        .send({ quantity: 20 });

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 para quantity inválida na atualização', async () => {
      firestoreMock = createFirestoreMock([basePosition]);

      const response = await request(app)
        .put('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader)
        .send({ quantity: -1 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando o novo ticker não existe no catálogo de ativos', async () => {
      firestoreMock = createFirestoreMock(
        [basePosition],
        createCatalogStubs(['HGLG11']),
      );

      const response = await request(app)
        .put('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader)
        .send({ ticker: 'INEXISTENTE11' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('catálogo');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .put('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader)
        .send({ quantity: 20 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/wallets/:walletId/positions/:id', () => {
    it('deve remover uma posição existente', async () => {
      firestoreMock = createFirestoreMock([basePosition]);

      const response = await request(app)
        .delete('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
    });

    it('deve retornar 404 para posição inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .delete('/api/wallets/wallet-1/positions/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .delete('/api/wallets/wallet-1/positions/position-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/wallets/:walletId/positions/:id/move-to-fridge', () => {
    const fridge: Fridge = {
      id: 'fridge-1',
      ownerId: 'user-123',
      name: 'Geladeira Principal',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    it('deve mover posição para geladeira com sucesso', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-1', targetPrice: 120 });

      expect(response.status).toBe(201);
      expect(response.body.ticker).toBe('HGLG11');
      expect(response.body.quantity).toBe(10);
      expect(response.body.transferredPrice).toBe(110.5);
      expect(response.body.targetPrice).toBe(120);
      expect(response.body.fridgeId).toBe('fridge-1');
      expect(response.body.assetType).toBe('FII');

      // Verifica que o batch foi usado
      const batchOps = firestoreMock._batch._operations;
      expect(batchOps.length).toBe(2);
      expect(batchOps[0].type).toBe('delete');
      expect(batchOps[1].type).toBe('set');
      expect(batchOps[1].data.ticker).toBe('HGLG11');
      expect(batchOps[1].data.transferredPrice).toBe(110.5);
      expect(batchOps[1].data.targetPrice).toBe(120);
    });

    it('deve retornar 404 se posição não existe', async () => {
      firestoreMock = createFirestoreMockWithFridge([], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/inexistente/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-1', targetPrice: 120 });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Position not found');
    });

    it('deve retornar 404 se geladeira não existe', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], []);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-inexistente', targetPrice: 120 });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Fridge not found');
    });

    it('deve retornar 400 se fridgeId não informado', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ targetPrice: 120 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('fridgeId');
    });

    it('deve retornar 400 se targetPrice não informado', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-1' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('targetPrice');
    });

    it('deve retornar 400 se targetPrice é negativo', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-1', targetPrice: -5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('targetPrice');
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMockWithFridge([basePosition], [fridge]);

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .send({ fridgeId: 'fridge-1', targetPrice: 120 });

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/wallets/wallet-1/positions/position-1/move-to-fridge')
        .set('Authorization', authHeader)
        .send({ fridgeId: 'fridge-1', targetPrice: 120 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
