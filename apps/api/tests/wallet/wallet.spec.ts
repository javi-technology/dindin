import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { app } from '../../src/index';

interface WalletData {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

function createWalletSnapshot(wallet: WalletData) {
  return {
    id: wallet.id,
    exists: true,
    data: () => ({ ...wallet }),
  };
}

function createFirestoreMock(wallets: WalletData[] = []) {
  const walletMap = new Map<string, any>();

  wallets.forEach((wallet) => {
    let data = { ...wallet };
    walletMap.set(wallet.id, {
      get: jest
        .fn()
        .mockImplementation(() => Promise.resolve(createWalletSnapshot(data))),
      set: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((value: any) => {
        data = { ...data, ...value };
        return Promise.resolve();
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      // Uma carteira tem a subcoleção `positions`, percorrida na exclusão em
      // cascata (issue #219). Aqui ela é vazia; o caso com posições usa
      // createFirestoreMockWithPositions.
      collection: jest.fn((subPath: string) => {
        if (subPath !== 'positions') {
          throw new Error(`Unexpected subcollection: ${subPath}`);
        }
        return {
          get: jest.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
        };
      }),
    });
  });

  function getWalletsSnapshot() {
    return {
      docs: wallets.map((wallet) => createWalletSnapshot(wallet)),
      empty: wallets.length === 0,
      forEach: (callback: any) => {
        wallets.forEach((wallet) => callback(createWalletSnapshot(wallet)));
      },
    };
  }

  const walletsCollection = {
    doc: jest.fn((id: string) => {
      if (!walletMap.has(id)) {
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
      return walletMap.get(id);
    }),
    add: jest.fn().mockResolvedValue({ id: 'new-wallet-id' }),
    get: jest.fn().mockResolvedValue(getWalletsSnapshot()),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'users') {
        return {
          doc: jest.fn((uid: string) => ({
            collection: jest.fn((subPath: string) => {
              if (subPath === 'wallets' && uid === 'user-123')
                return walletsCollection;
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }),
          })),
        };
      }
      throw new Error(`Unexpected collection: ${path}`);
    }),
  };
}

/** Cria um mock do Firestore que lança erro em qualquer operação de coleção. */
function createFailingFirestoreMock() {
  return {
    collection: jest.fn(() => {
      return {
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
      };
    }),
  };
}

/**
 * Mock com a subcoleção `positions` da carteira e um `batch()` que registra as
 * operações (issue #219). Usado para provar que excluir a carteira remove as
 * posições em cascata, em lotes que respeitam o limite do Firestore.
 */
function createFirestoreMockWithPositions(
  wallet: WalletData,
  positionIds: string[],
) {
  const deletedRefs: string[] = [];
  const commits: number[] = [];
  let pendingDeletes = 0;

  const positionDocs = positionIds.map((id) => ({
    id,
    ref: { path: `positions/${id}` },
  }));

  const walletRef = {
    id: wallet.id,
    path: `wallets/${wallet.id}`,
    get: jest.fn().mockResolvedValue(createWalletSnapshot(wallet)),
    delete: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn((subPath: string) => {
      if (subPath !== 'positions') {
        throw new Error(`Unexpected subcollection: ${subPath}`);
      }
      return {
        get: jest.fn().mockResolvedValue({
          docs: positionDocs,
          empty: positionDocs.length === 0,
          size: positionDocs.length,
        }),
      };
    }),
  };

  const firestore = {
    collection: jest.fn((path: string) => {
      if (path !== 'users') throw new Error(`Unexpected collection: ${path}`);
      return {
        doc: jest.fn(() => ({
          collection: jest.fn((subPath: string) => {
            if (subPath !== 'wallets') {
              throw new Error(`Unexpected subcollection: ${subPath}`);
            }
            return { doc: jest.fn(() => walletRef) };
          }),
        })),
      };
    }),
    batch: jest.fn(() => ({
      delete: jest.fn((ref: { path: string }) => {
        deletedRefs.push(ref.path);
        pendingDeletes += 1;
      }),
      commit: jest.fn(() => {
        commits.push(pendingDeletes);
        pendingDeletes = 0;
        return Promise.resolve();
      }),
    })),
  };

  return { firestore, deletedRefs, commits, walletRef };
}

describe('Wallet CRUD', () => {
  const authHeader = 'Bearer valid-token';
  const baseWallet: WalletData = {
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

  describe('GET /api/wallets', () => {
    it('deve listar as carteiras do usuário autenticado', async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([baseWallet]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get('/api/wallets');

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/wallets', () => {
    it('deve criar uma carteira com dados válidos', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Carteira', currency: 'BRL' });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-wallet-id');
      expect(response.body.ownerId).toBe('user-123');
      expect(response.body.name).toBe('Nova Carteira');
      expect(response.body.currency).toBe('BRL');
      expect(firestoreMock.collection).toHaveBeenCalledWith('users');
    });

    it('deve retornar 400 quando name não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets')
        .set('Authorization', authHeader)
        .send({ currency: 'BRL' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 quando currency não é informado', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Carteira' });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 para currency com código inválido', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/wallets')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Carteira', currency: 'REAL' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/not supported/);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/wallets')
        .set('Authorization', authHeader)
        .send({ name: 'Nova Carteira', currency: 'BRL' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/wallets/:id', () => {
    it('deve retornar uma carteira existente', async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .get('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseWallet);
    });

    it('deve retornar 404 para carteira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .get('/api/wallets/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/wallets/:id', () => {
    it('deve atualizar uma carteira existente', async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .put('/api/wallets/wallet-1')
        .set('Authorization', authHeader)
        .send({ name: 'Carteira Atualizada' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Carteira Atualizada');
      expect(response.body.id).toBe('wallet-1');
    });

    it('deve retornar 404 para carteira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .put('/api/wallets/inexistente')
        .set('Authorization', authHeader)
        .send({ name: 'Carteira Atualizada' });

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 para currency inválida na atualização', async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .put('/api/wallets/wallet-1')
        .set('Authorization', authHeader)
        .send({ currency: 'INVALID' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/not supported/);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .put('/api/wallets/wallet-1')
        .set('Authorization', authHeader)
        .send({ name: 'Carteira Atualizada' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/wallets/:id', () => {
    it('deve remover uma carteira existente', async () => {
      firestoreMock = createFirestoreMock([baseWallet]);

      const response = await request(app)
        .delete('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
    });

    it('deve retornar 404 para carteira inexistente', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .delete('/api/wallets/inexistente')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .delete('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    // O Firestore não cascadeia deletes: sem isso as posições ficariam órfãs
    // e inacessíveis pela API, que só as alcança a partir da carteira.
    it('deve remover as posições da carteira antes de excluí-la', async () => {
      const mock = createFirestoreMockWithPositions(baseWallet, [
        'pos-1',
        'pos-2',
        'pos-3',
      ]);
      firestoreMock = mock.firestore;

      const response = await request(app)
        .delete('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
      expect(mock.deletedRefs).toEqual([
        'positions/pos-1',
        'positions/pos-2',
        'positions/pos-3',
      ]);
      expect(mock.walletRef.delete).toHaveBeenCalled();
    });

    it('deve excluir a carteira sem posições sem abrir batch vazio', async () => {
      const mock = createFirestoreMockWithPositions(baseWallet, []);
      firestoreMock = mock.firestore;

      const response = await request(app)
        .delete('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
      expect(mock.commits).toEqual([]);
      expect(mock.walletRef.delete).toHaveBeenCalled();
    });

    // Um batch do Firestore aceita no máximo 500 operações; acima disso o
    // commit falha e a carteira não seria excluída.
    it('deve remover as posições em lotes de no máximo 500', async () => {
      const positionIds = Array.from(
        { length: 501 },
        (_, index) => `pos-${index}`,
      );
      const mock = createFirestoreMockWithPositions(baseWallet, positionIds);
      firestoreMock = mock.firestore;

      const response = await request(app)
        .delete('/api/wallets/wallet-1')
        .set('Authorization', authHeader);

      expect(response.status).toBe(204);
      expect(mock.deletedRefs).toHaveLength(501);
      expect(mock.commits).toEqual([500, 1]);
      expect(mock.commits.every((operations) => operations <= 500)).toBe(true);
    });
  });
});
