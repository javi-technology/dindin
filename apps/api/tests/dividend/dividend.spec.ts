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
import { Dividend, Position } from 'dindin-models';

function createDividendSnapshot(dividend: Dividend) {
  return {
    id: dividend.id,
    exists: true,
    data: () => ({ ...dividend }),
  };
}

function createFirestoreMock(dividends: Dividend[] = []) {
  const dividendMap = new Map<string, any>();

  dividends.forEach((dividend) => {
    let data = { ...dividend };
    dividendMap.set(dividend.id, {
      id: dividend.id,
      get: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createDividendSnapshot(data)),
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

  const dividendsCollection = {
    doc: jest.fn((id: string) => {
      if (!dividendMap.has(id)) {
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
      return dividendMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-dividend-id' }),
    get: jest.fn().mockResolvedValue({
      docs: dividends.map((dividend) => createDividendSnapshot(dividend)),
      empty: dividends.length === 0,
    }),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'dividends' && uid === 'user-123') {
                return dividendsCollection;
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

function createFirestoreMockWithPositions(
  dividends: Dividend[] = [],
  positions: Position[] = [],
) {
  const dividendMap = new Map<string, any>();
  const positionMap = new Map<string, any>();

  dividends.forEach((dividend) => {
    let data = { ...dividend };
    dividendMap.set(dividend.id, {
      id: dividend.id,
      get: jest.fn().mockResolvedValue(createDividendSnapshot(data)),
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

  positions.forEach((position) => {
    let data = { ...position };
    positionMap.set(position.id, {
      id: position.id,
      get: jest.fn().mockResolvedValue(createPositionSnapshot(data)),
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

  const dividendsCollection = {
    doc: jest.fn((id: string) => {
      if (!dividendMap.has(id)) {
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
      return dividendMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-dividend-id' }),
    get: jest.fn().mockResolvedValue({
      docs: dividends.map((dividend) => createDividendSnapshot(dividend)),
      empty: dividends.length === 0,
    }),
  };

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
      docs: positions.map((position) => createPositionSnapshot(position)),
      empty: positions.length === 0,
    }),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'dividends' && uid === 'user-123') {
                return dividendsCollection;
              }
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

function createPositionSnapshot(position: Position) {
  return {
    id: position.id,
    exists: true,
    data: () => ({ ...position }),
  };
}

function createWalletSnapshot(
  walletId: string,
  wallet: {
    id: string;
    ownerId: string;
    name: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  },
  positionsCollection: any,
) {
  return {
    id: wallet.id,
    exists: true,
    data: () => ({ ...wallet }),
    ref: {
      collection: jest.fn((positionPath: string) => {
        if (positionPath !== 'positions') {
          throw new Error(`Unexpected subcollection: ${positionPath}`);
        }
        return positionsCollection;
      }),
    },
  };
}

function createFirestoreMockWithWalletsAndPositions(
  wallets: {
    id: string;
    ownerId: string;
    name: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }[] = [],
  positionsByWallet: Record<string, Position[]> = {},
  dividends: Dividend[] = [],
) {
  const dividendMap = new Map<string, any>();
  const positionsCollections: Record<string, any> = {};

  dividends.forEach((dividend) => {
    let data = { ...dividend };
    dividendMap.set(dividend.id, {
      id: dividend.id,
      get: jest.fn().mockResolvedValue(createDividendSnapshot(data)),
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

  Object.entries(positionsByWallet).forEach(([walletId, positions]) => {
    const positionMap = new Map<string, any>();
    positions.forEach((position) => {
      let data = { ...position };
      positionMap.set(position.id, {
        id: position.id,
        exists: true,
        data: () => ({ ...data }),
        get: jest.fn().mockResolvedValue(createPositionSnapshot(data)),
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

    positionsCollections[walletId] = {
      doc: jest.fn((positionId: string) => {
        if (!positionMap.has(positionId)) {
          return {
            id: positionId,
            exists: false,
            data: () => null,
            get: jest.fn().mockResolvedValue({
              id: positionId,
              exists: false,
              data: () => null,
            }),
            set: jest.fn().mockResolvedValue(undefined),
            update: jest
              .fn()
              .mockRejectedValue(new Error('Document does not exist')),
            delete: jest
              .fn()
              .mockRejectedValue(new Error('Document does not exist')),
          };
        }
        return positionMap.get(positionId);
      }),
      add: jest.fn().mockResolvedValue({ id: 'new-position-id' }),
      get: jest.fn().mockResolvedValue({
        docs: Array.from(positionMap.values()).map((doc: any) => ({
          id: doc.id,
          exists: true,
          data: doc.data,
        })),
        empty: positionMap.size === 0,
      }),
    };
  });

  function getPositionsCollection(walletId: string) {
    return (
      positionsCollections[walletId] || {
        doc: jest.fn((positionId: string) => ({
          id: positionId,
          exists: false,
          data: () => null,
          get: jest.fn().mockResolvedValue({
            id: positionId,
            exists: false,
            data: () => null,
          }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
          delete: jest
            .fn()
            .mockRejectedValue(new Error('Document does not exist')),
        })),
        add: jest.fn().mockResolvedValue({ id: 'new-position-id' }),
        get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
      }
    );
  }

  const dividendsCollection = {
    doc: jest.fn((id: string) => {
      if (!dividendMap.has(id)) {
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
      return dividendMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-dividend-id' }),
    get: jest.fn().mockResolvedValue({
      docs: dividends.map((dividend) => createDividendSnapshot(dividend)),
      empty: dividends.length === 0,
    }),
  };

  function getWalletDoc(walletId: string) {
    const wallet = wallets.find((w) => w.id === walletId);
    return {
      id: walletId,
      exists: !!wallet,
      data: () => (wallet ? { ...wallet } : null),
      get: jest.fn().mockResolvedValue(
        wallet
          ? createWalletSnapshot(
              walletId,
              wallet,
              getPositionsCollection(walletId),
            )
          : {
              id: walletId,
              exists: false,
              data: () => null,
            },
      ),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      collection: jest.fn((positionPath: string) => {
        if (positionPath !== 'positions') {
          throw new Error(`Unexpected subcollection: ${positionPath}`);
        }
        return getPositionsCollection(walletId);
      }),
    };
  }

  const walletsCollection = {
    doc: jest.fn((id: string) => getWalletDoc(id)),
    get: jest.fn().mockResolvedValue({
      docs: wallets.map((wallet) =>
        createWalletSnapshot(
          wallet.id,
          wallet,
          getPositionsCollection(wallet.id),
        ),
      ),
      empty: wallets.length === 0,
    }),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => {
            if (uid !== 'user-123') {
              throw new Error(`Unexpected uid: ${uid}`);
            }
            return {
              collection: jest.fn((subPath: string) => {
                if (subPath === 'dividends') {
                  return dividendsCollection;
                }
                if (subPath === 'wallets') {
                  return walletsCollection;
                }
                throw new Error(`Unexpected subcollection: ${subPath}`);
              }),
            };
          }),
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
          get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
          add: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
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
  };
}

describe('Dividend CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const baseDividend: Dividend = {
    id: 'dividend-1',
    userId: 'user-123',
    ticker: 'HGLG11',
    assetType: 'FII',
    amountPerShare: 0.82,
    quantity: 100,
    totalAmount: 82,
    paymentDate: '2026-01-15',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  describe('GET /api/dividends', () => {
    it('deve listar os proventos do usuário', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .get('/api/dividends')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([baseDividend]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get('/api/dividends');

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/dividends')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/dividends', () => {
    it('deve criar um provento com dados válidos e calcular totalAmount', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          assetType: 'FII',
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-dividend-id');
      expect(response.body.userId).toBe('user-123');
      expect(response.body.ticker).toBe('HGLG11');
      expect(response.body.totalAmount).toBe(82);
    });

    it('deve retornar 400 quando ticker não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando amountPerShare não é um número não-negativo', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: -1,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando quantity não é um número positivo', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: 0.82,
          quantity: 0,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando paymentDate não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({ ticker: 'HGLG11', amountPerShare: 0.82, quantity: 100 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando paymentDate não está no formato YYYY-MM-DD', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '15/01/2026',
        });

      expect(response.status).toBe(400);
    });

    it('deve remover espaços do paymentDate antes de salvar', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '  2026-01-15  ',
        });

      expect(response.status).toBe(201);
      expect(response.body.paymentDate).toBe('2026-01-15');
    });

    it('deve retornar 400 quando assetType é inválido', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          assetType: 'CRYPTO',
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando amountPerShare é Infinity', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: Infinity,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(400);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/dividends')
        .set('Authorization', authHeader)
        .send({
          ticker: 'HGLG11',
          amountPerShare: 0.82,
          quantity: 100,
          paymentDate: '2026-01-15',
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/dividends/:id', () => {
    it('deve retornar um provento existente', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .get('/api/dividends/dividend-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseDividend);
    });

    it('deve retornar 404 para provento inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .get('/api/dividends/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/dividends/dividend-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/dividends/:id', () => {
    it('deve atualizar um provento existente e recalcular totalAmount', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ quantity: 200 });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(200);
      expect(response.body.totalAmount).toBe(164);
      expect(response.body.id).toBe('dividend-1');
    });

    it('deve recalcular totalAmount ao alterar apenas amountPerShare', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ amountPerShare: 1 });

      expect(response.status).toBe(200);
      expect(response.body.amountPerShare).toBe(1);
      expect(response.body.totalAmount).toBe(100);
    });

    it('deve remover espaços do paymentDate ao atualizar', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ paymentDate: '  2026-02-20  ' });

      expect(response.status).toBe(200);
      expect(response.body.paymentDate).toBe('2026-02-20');
    });

    it('deve retornar 400 quando paymentDate não está no formato YYYY-MM-DD na atualização', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ paymentDate: '20/02/2026' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 404 para provento inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .put('/api/dividends/inexistente')
        .set('Authorization', authHeader)
        .send({ quantity: 200 });

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 para quantity inválida na atualização', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ quantity: -1 });

      expect(response.status).toBe(400);
    });

    it('deve retornar 500 quando o documento existente está com amountPerShare ou quantity corrompidos', async () => {
      const corruptedDividend = {
        ...baseDividend,
        amountPerShare: undefined,
      } as unknown as Dividend;
      firestoreMock = createFirestoreMock([corruptedDividend]);

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ quantity: 200 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .put('/api/dividends/dividend-1')
        .set('Authorization', authHeader)
        .send({ quantity: 200 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/dividends/:id', () => {
    it('deve remover um provento existente', async () => {
      firestoreMock = createFirestoreMock([baseDividend]);

      const response = await request(app)
        .delete('/api/dividends/dividend-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
    });

    it('deve retornar 404 para provento inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .delete('/api/dividends/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .delete('/api/dividends/dividend-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/dividends/projection', () => {
    const wallet = {
      id: 'wallet-1',
      ownerId: 'user-123',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const hglgPosition: Position = {
      id: 'position-hglg',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 200,
      averagePrice: 110,
      currentPrice: 112,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const xplgPosition: Position = {
      id: 'position-xplg',
      walletId: 'wallet-1',
      ticker: 'XPLG11',
      assetType: 'FII',
      quantity: 75,
      averagePrice: 90,
      currentPrice: 92,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    it('deve calcular projeção mensal com base na quantidade atual da posição', async () => {
      const olderHglg: Dividend = {
        ...baseDividend,
        id: 'dividend-older',
        ticker: 'HGLG11',
        paymentDate: '2026-01-15',
        amountPerShare: 0.82,
        quantity: 100,
        totalAmount: 82,
      };
      const newerHglg: Dividend = {
        ...baseDividend,
        id: 'dividend-newer',
        ticker: 'HGLG11',
        paymentDate: '2026-02-15',
        amountPerShare: 0.9,
        quantity: 150,
        totalAmount: 135,
      };
      const xplg: Dividend = {
        ...baseDividend,
        id: 'dividend-xplg',
        ticker: 'XPLG11',
        paymentDate: '2026-02-10',
        amountPerShare: 0.7,
        quantity: 50,
        totalAmount: 35,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [wallet],
        { 'wallet-1': [hglgPosition, xplgPosition] },
        [olderHglg, newerHglg, xplg],
      );

      const response = await request(app)
        .get('/api/dividends/projection')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.projections).toHaveLength(2);
      // 0.9 * 200 + 0.7 * 75 = 180 + 52.5 = 232.5
      expect(response.body.total).toBeCloseTo(232.5, 2);

      const hglg = response.body.projections.find(
        (p: { ticker: string }) => p.ticker === 'HGLG11',
      );
      expect(hglg.amountPerShare).toBe(0.9);
      expect(hglg.quantity).toBe(200);
      expect(hglg.monthlyAmount).toBeCloseTo(180, 2);

      const xplgProjection = response.body.projections.find(
        (p: { ticker: string }) => p.ticker === 'XPLG11',
      );
      expect(xplgProjection.quantity).toBe(75);
      expect(xplgProjection.monthlyAmount).toBeCloseTo(52.5, 2);
    });

    it('deve agrupar proventos e posições de forma case-insensitive', async () => {
      const dividendLowerCase: Dividend = {
        ...baseDividend,
        id: 'dividend-lower',
        ticker: 'hglg11',
        paymentDate: '2026-02-15',
        amountPerShare: 0.9,
        quantity: 100,
        totalAmount: 90,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [wallet],
        { 'wallet-1': [hglgPosition] },
        [dividendLowerCase],
      );

      const response = await request(app)
        .get('/api/dividends/projection')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.projections).toHaveLength(1);
      expect(response.body.projections[0].ticker).toBe('HGLG11');
      expect(response.body.projections[0].quantity).toBe(200);
      expect(response.body.projections[0].monthlyAmount).toBeCloseTo(180, 2);
    });

    it('deve retornar projeção vazia quando não há proventos', async () => {
      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [wallet],
        { 'wallet-1': [hglgPosition] },
        [],
      );

      const response = await request(app)
        .get('/api/dividends/projection')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.projections).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('deve retornar projeção vazia quando não há posições', async () => {
      firestoreMock = createFirestoreMockWithWalletsAndPositions([wallet], {}, [
        baseDividend,
      ]);

      const response = await request(app)
        .get('/api/dividends/projection')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.projections).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /api/wallets/:walletId/dividend-yield', () => {
    const basePosition: Position = {
      id: 'position-1',
      walletId: 'wallet-1',
      ticker: 'HGLG11',
      assetType: 'FII',
      quantity: 10,
      averagePrice: 110.5,
      currentPrice: 112,
      inFridge: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const defaultWallet = {
      id: 'wallet-1',
      ownerId: 'user-123',
      name: 'Carteira Principal',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    it('deve calcular dividend yield por ativo e consolidado da carteira', async () => {
      const olderHglg: Dividend = {
        ...baseDividend,
        id: 'dividend-older',
        ticker: 'HGLG11',
        paymentDate: '2026-01-15',
        amountPerShare: 0.82,
        quantity: 100,
        totalAmount: 82,
      };
      const newerHglg: Dividend = {
        ...baseDividend,
        id: 'dividend-newer',
        ticker: 'HGLG11',
        paymentDate: '2026-02-15',
        amountPerShare: 0.9,
        quantity: 150,
        totalAmount: 135,
      };
      const knriDividend: Dividend = {
        ...baseDividend,
        id: 'dividend-knri',
        ticker: 'KNRI11',
        paymentDate: '2026-02-10',
        amountPerShare: 0.75,
        quantity: 50,
        totalAmount: 37.5,
      };

      const knriPosition: Position = {
        ...basePosition,
        id: 'position-2',
        ticker: 'KNRI11',
        quantity: 5,
        averagePrice: 130,
        currentPrice: 132,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [defaultWallet],
        { 'wallet-1': [basePosition, knriPosition] },
        [olderHglg, newerHglg, knriDividend],
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.byTicker).toHaveLength(2);

      const hglg = response.body.byTicker.find(
        (p: { ticker: string }) => p.ticker === 'HGLG11',
      );
      // monthly: 0.9 * 10 = 9; annual: 108; currentValue: 10 * 112 = 1120; yield: 108 / 1120 * 100
      expect(hglg.annualIncome).toBeCloseTo(108, 2);
      expect(hglg.currentValue).toBeCloseTo(1120, 2);
      expect(hglg.yield).toBeCloseTo(9.64, 2);

      const knri = response.body.byTicker.find(
        (p: { ticker: string }) => p.ticker === 'KNRI11',
      );
      // monthly: 0.75 * 5 = 3.75; annual: 45; currentValue: 5 * 132 = 660; yield: 45 / 660 * 100
      expect(knri.annualIncome).toBeCloseTo(45, 2);
      expect(knri.currentValue).toBeCloseTo(660, 2);
      expect(knri.yield).toBeCloseTo(6.82, 2);

      expect(response.body.total.annualIncome).toBeCloseTo(153, 2);
      expect(response.body.total.currentValue).toBeCloseTo(1780, 2);
      expect(response.body.total.yield).toBeCloseTo(8.6, 2);
    });

    it('deve retornar yields zerados quando não há posições', async () => {
      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [defaultWallet],
        { 'wallet-1': [] },
        [],
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.byTicker).toEqual([]);
      expect(response.body.total.annualIncome).toBe(0);
      expect(response.body.total.currentValue).toBe(0);
      expect(response.body.total.yield).toBe(0);
    });

    it('deve usar averagePrice quando currentPrice não está definido', async () => {
      const dividend: Dividend = {
        ...baseDividend,
        id: 'dividend-hglg',
        ticker: 'HGLG11',
        paymentDate: '2026-02-15',
        amountPerShare: 1.1,
        quantity: 10,
        totalAmount: 11,
      };
      const positionWithoutCurrent: Position = {
        ...basePosition,
        currentPrice: undefined,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [defaultWallet],
        { 'wallet-1': [positionWithoutCurrent] },
        [dividend],
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      const hglg = response.body.byTicker[0];
      // monthly: 1.1 * 10 = 11; annual: 132; currentValue: 10 * 110.5 = 1105; yield: 132 / 1105 * 100
      expect(hglg.currentValue).toBeCloseTo(1105, 2);
      expect(hglg.yield).toBeCloseTo(11.95, 2);
    });

    it('deve retornar yield zerado para posição sem preço e sem gerar NaN', async () => {
      const dividend: Dividend = {
        ...baseDividend,
        id: 'dividend-hglg',
        ticker: 'HGLG11',
        paymentDate: '2026-02-15',
        amountPerShare: 1.1,
        quantity: 10,
        totalAmount: 11,
      };
      const positionWithoutPrice: Position = {
        ...basePosition,
        averagePrice: undefined as unknown as number,
        currentPrice: undefined,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [defaultWallet],
        { 'wallet-1': [positionWithoutPrice] },
        [dividend],
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      const hglg = response.body.byTicker[0];
      expect(hglg.currentValue).toBe(0);
      expect(hglg.yield).toBe(0);
      expect(response.body.total.yield).toBe(0);
      expect(JSON.stringify(response.body)).not.toContain('NaN');
    });

    it('deve fazer matching de ticker case-insensitive entre posição e provento', async () => {
      const dividendLowerCase: Dividend = {
        ...baseDividend,
        id: 'dividend-lower',
        ticker: 'hglg11',
        paymentDate: '2026-02-15',
        amountPerShare: 0.9,
        quantity: 100,
        totalAmount: 90,
      };

      firestoreMock = createFirestoreMockWithWalletsAndPositions(
        [defaultWallet],
        { 'wallet-1': [basePosition] },
        [dividendLowerCase],
      );

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      const hglg = response.body.byTicker[0];
      expect(hglg.annualIncome).toBeCloseTo(0.9 * 10 * 12, 2);
      expect(hglg.currentValue).toBeCloseTo(1120, 2);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/wallets/wallet-1/dividend-yield')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
