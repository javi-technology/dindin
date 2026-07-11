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
import { Position, AssetType } from 'dindin-models';

interface PositionData extends Position {}

function createPositionSnapshot(position: PositionData) {
  return {
    id: position.id,
    exists: true,
    data: () => ({ ...position }),
  };
}

function createFirestoreMock(positions: PositionData[] = []) {
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
      docs: positions.map((position) => createPositionSnapshot(position)),
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

describe('Position CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const basePosition: PositionData = {
    id: 'position-1',
    walletId: 'wallet-1',
    ticker: 'HGLG11',
    assetType: 'FII' as AssetType,
    quantity: 10,
    averagePrice: 110.5,
    currentPrice: 112.0,
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
});
