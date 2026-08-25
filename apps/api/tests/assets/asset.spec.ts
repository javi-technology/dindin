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

interface AssetData {
  ticker: string;
  name: string;
  assetType: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function createAssetSnapshot(asset: AssetData) {
  return {
    id: asset.ticker,
    exists: true,
    data: () => ({ ...asset }),
  };
}

function createFirestoreMock(assets: AssetData[] = []) {
  const setCalls: Array<{ id: string; data: unknown }> = [];
  const assetsCollection = {
    where: jest.fn((field: string, _op: string, value: unknown) => ({
      get: jest.fn().mockResolvedValue({
        docs: assets
          .filter((asset) => (asset as any)[field] === value)
          .map((asset) => createAssetSnapshot(asset)),
      }),
    })),
    doc: jest.fn((ticker: string) => {
      const asset = assets.find((a) => a.ticker === ticker);
      return {
        get: jest
          .fn()
          .mockResolvedValue(
            asset
              ? createAssetSnapshot(asset)
              : { id: ticker, exists: false, data: () => null },
          ),
        set: jest.fn().mockImplementation((data: unknown) => {
          setCalls.push({ id: ticker, data });
          return Promise.resolve();
        }),
      };
    }),
    get: jest.fn().mockResolvedValue({
      docs: assets.map((asset) => createAssetSnapshot(asset)),
    }),
  };

  return {
    collection: jest.fn((path: string) => {
      if (path === 'assets') return assetsCollection;
      throw new Error(`Unexpected collection: ${path}`);
    }),
    getSetCalls: () => setCalls,
  };
}

function createFailingFirestoreMock() {
  return {
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
      })),
      get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
        set: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
      })),
    })),
  };
}

describe('Assets', () => {
  const authHeader = 'Bearer valid-token';
  const activeAsset: AssetData = {
    ticker: 'HGLG11',
    name: 'CSHG Logística',
    assetType: 'FII',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const inactiveAsset: AssetData = {
    ticker: 'OLDX11',
    name: 'Ativo Descontinuado',
    assetType: 'FII',
    active: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
  });

  describe('GET /api/assets', () => {
    it('deve listar apenas ativos ativos do catálogo', async () => {
      firestoreMock = createFirestoreMock([activeAsset, inactiveAsset]);

      const response = await request(app)
        .get('/api/assets')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([activeAsset]);
    });

    it('deve retornar 401 sem token de autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).get('/api/assets');

      expect(response.status).toBe(401);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .get('/api/assets')
        .set('Authorization', authHeader);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/admin/assets', () => {
    it('deve criar um ativo com usuário admin', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'admin-123', admin: true });
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({
          ticker: 'itub4',
          name: 'Itaú Unibanco',
          assetType: 'STOCK',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        ticker: 'ITUB4',
        name: 'Itaú Unibanco',
        assetType: 'STOCK',
        active: true,
      });
      expect(firestoreMock.getSetCalls()).toHaveLength(1);
      expect(firestoreMock.getSetCalls()[0].id).toBe('ITUB4');
    });

    it('deve retornar 403 para usuário não-admin', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'user-123' });
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({ ticker: 'ITUB4', name: 'Itaú', assetType: 'STOCK' });

      expect(response.status).toBe(403);
    });

    it('deve retornar 401 sem autenticação', async () => {
      firestoreMock = createFirestoreMock([]);

      const response = await request(app).post('/api/admin/assets').send({
        ticker: 'ITUB4',
        name: 'Itaú',
        assetType: 'STOCK',
      });

      expect(response.status).toBe(401);
    });

    it('deve retornar 400 quando o ticker está ausente', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'admin-123', admin: true });
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({ name: 'Itaú', assetType: 'STOCK' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar 400 quando assetType é inválido', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'admin-123', admin: true });
      firestoreMock = createFirestoreMock([]);

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({ ticker: 'ITUB4', name: 'Itaú', assetType: 'CRYPTO' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar 409 quando o ticker já existe', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'admin-123', admin: true });
      firestoreMock = createFirestoreMock([activeAsset]);

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({
          ticker: activeAsset.ticker,
          name: 'Outro',
          assetType: 'STOCK',
        });

      expect(response.status).toBe(409);
    });

    it('deve retornar 500 quando o Firestore falha', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'admin-123', admin: true });
      firestoreMock = createFailingFirestoreMock();

      const response = await request(app)
        .post('/api/admin/assets')
        .set('Authorization', authHeader)
        .send({ ticker: 'ITUB4', name: 'Itaú', assetType: 'STOCK' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
