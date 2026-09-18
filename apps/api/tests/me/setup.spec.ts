import request from 'supertest';

const verifyIdTokenMock = jest.fn();

let firestoreMock: FakeFirestore;

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

// ---------------------------------------------------------------------------
// Firestore em memória com transações serializadas, como o Admin SDK garante:
// duas transações que leem e gravam o mesmo documento nunca se intercalam.
// Leituras e escritas só existem dentro da transação, então um provisionamento
// que lesse fora dela não conseguiria rodar aqui.
// ---------------------------------------------------------------------------

type Data = Record<string, unknown>;

interface FakeDocRef {
  kind: 'doc';
  path: string;
  id: string;
  collection: (name: string) => FakeCollectionRef;
}

interface FakeCollectionRef {
  kind: 'collection';
  path: string;
  doc: (id?: string) => FakeDocRef;
  limit: (count: number) => FakeCollectionRef;
  max?: number;
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  transactions = 0;
  private lock: Promise<unknown> = Promise.resolve();
  private autoId = 0;

  collection(name: string): FakeCollectionRef {
    return this.collectionRef(name);
  }

  runTransaction<T>(callback: (tx: FakeTransaction) => Promise<T>) {
    const run = this.lock.then(async () => {
      this.transactions += 1;
      const tx = new FakeTransaction(this);
      // Cede o event loop entre leitura e escrita: sem o lock, requisições
      // paralelas leriam o mesmo estado vazio e criariam duplicatas.
      const result = await callback(tx);
      tx.commit();
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  seed(path: string, data: Data): void {
    this.docs.set(path, data);
  }

  list(collectionPath: string): { id: string; data: Data }[] {
    const prefix = `${collectionPath}/`;
    return [...this.docs.entries()]
      .filter(
        ([path]) =>
          path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
      )
      .map(([path, data]) => ({ id: path.slice(prefix.length), data }));
  }

  private collectionRef(path: string, max?: number): FakeCollectionRef {
    return {
      kind: 'collection',
      path,
      max,
      doc: (id?: string) =>
        this.docRef(`${path}/${id ?? `auto-${++this.autoId}`}`),
      limit: (count: number) => this.collectionRef(path, count),
    };
  }

  private docRef(path: string): FakeDocRef {
    return {
      kind: 'doc',
      path,
      id: path.split('/').pop()!,
      collection: (name: string) => this.collectionRef(`${path}/${name}`),
    };
  }
}

class FakeTransaction {
  private readonly writes: (() => void)[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocRef | FakeCollectionRef) {
    await Promise.resolve();
    if (ref.kind === 'doc') {
      const data = this.db.docs.get(ref.path);
      return { id: ref.id, exists: data !== undefined, data: () => data };
    }
    const docs = this.db
      .list(ref.path)
      .slice(0, ref.max ?? Infinity)
      .map(({ id, data }) => ({ id, data: () => data }));
    return { empty: docs.length === 0, size: docs.length, docs };
  }

  create(ref: FakeDocRef, data: Data): this {
    this.writes.push(() => {
      if (this.db.docs.has(ref.path)) throw new Error('already exists');
      this.db.docs.set(ref.path, { ...data });
    });
    return this;
  }

  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }): this {
    this.writes.push(() => {
      const current = options?.merge ? (this.db.docs.get(ref.path) ?? {}) : {};
      this.db.docs.set(ref.path, { ...current, ...data });
    });
    return this;
  }

  commit(): void {
    this.writes.forEach((write) => write());
  }
}

const UID = 'user-123';
const authHeader = 'Bearer valid-token';

const wallets = () => firestoreMock.list(`users/${UID}/wallets`);
const fridges = () => firestoreMock.list(`users/${UID}/fridges`);
const setup = (body?: object) => {
  const req = request(app)
    .post('/api/me/setup')
    .set('Authorization', authHeader);
  return body ? req.send(body) : req;
};

describe('POST /api/me/setup (#275)', () => {
  beforeEach(() => {
    firestoreMock = new FakeFirestore();
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: UID });
  });

  it('deve exigir autenticação', async () => {
    const response = await request(app).post('/api/me/setup');

    expect(response.status).toBe(401);
    expect(firestoreMock.transactions).toBe(0);
  });

  it('deve criar a Carteira Principal e a Geladeira Principal para usuário novo', async () => {
    const response = await setup();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ walletCreated: true, fridgeCreated: true });
    expect(wallets()).toEqual([
      {
        id: expect.any(String),
        data: expect.objectContaining({
          ownerId: UID,
          name: 'Carteira Principal',
          currency: 'BRL',
          description: '',
        }),
      },
    ]);
    expect(fridges()).toEqual([
      {
        id: expect.any(String),
        data: expect.objectContaining({
          ownerId: UID,
          name: 'Geladeira Principal',
          description: '',
        }),
      },
    ]);
    expect(firestoreMock.docs.get(`users/${UID}`)).toEqual({
      defaultsProvisionedAt: expect.any(String),
    });
  });

  it('deve ser idempotente em chamadas repetidas', async () => {
    await setup();
    const response = await setup();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      walletCreated: false,
      fridgeCreated: false,
    });
    expect(wallets().length).toBe(1);
    expect(fridges().length).toBe(1);
  });

  it('deve criar exatamente uma de cada com chamadas em paralelo', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => setup()),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(
      responses.filter((response) => response.body.walletCreated).length,
    ).toBe(1);
    expect(wallets().length).toBe(1);
    expect(fridges().length).toBe(1);
  });

  it('deve criar só a geladeira para usuário existente que já tem carteira', async () => {
    const existing = {
      ownerId: UID,
      name: 'Minha carteira',
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    firestoreMock.seed(`users/${UID}/wallets/wallet-1`, existing);

    const response = await setup();

    expect(response.body).toEqual({
      walletCreated: false,
      fridgeCreated: true,
    });
    expect(wallets()).toEqual([{ id: 'wallet-1', data: existing }]);
    expect(fridges().length).toBe(1);
  });

  it('não deve recriar o que o usuário apagou depois do provisionamento', async () => {
    firestoreMock.seed(`users/${UID}`, {
      defaultsProvisionedAt: '2026-09-01T00:00:00Z',
      subscription: { status: 'active' },
    });

    const response = await setup();

    expect(response.body).toEqual({
      walletCreated: false,
      fridgeCreated: false,
    });
    expect(wallets()).toEqual([]);
    expect(fridges()).toEqual([]);
  });

  it('deve preservar os demais campos do documento do usuário', async () => {
    firestoreMock.seed(`users/${UID}`, { subscription: { status: 'active' } });

    await setup();

    expect(firestoreMock.docs.get(`users/${UID}`)).toEqual({
      subscription: { status: 'active' },
      defaultsProvisionedAt: expect.any(String),
    });
  });

  describe('pedido explícito pelo botão de fallback', () => {
    beforeEach(() => {
      firestoreMock.seed(`users/${UID}`, {
        defaultsProvisionedAt: '2026-09-01T00:00:00Z',
      });
    });

    it('deve criar a carteira mesmo com o marcador, sem tocar na geladeira', async () => {
      const response = await setup({ resource: 'wallet' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        walletCreated: true,
        fridgeCreated: false,
      });
      expect(wallets().length).toBe(1);
      expect(fridges()).toEqual([]);
    });

    it('deve criar a geladeira mesmo com o marcador, sem tocar na carteira', async () => {
      const response = await setup({ resource: 'fridge' });

      expect(response.body).toEqual({
        walletCreated: false,
        fridgeCreated: true,
      });
      expect(wallets()).toEqual([]);
      expect(fridges().length).toBe(1);
    });

    it('não deve duplicar quando o recurso já existe', async () => {
      await Promise.all([
        setup({ resource: 'wallet' }),
        setup({ resource: 'wallet' }),
      ]);

      expect(wallets().length).toBe(1);
    });

    it('deve recusar recurso desconhecido', async () => {
      const response = await setup({ resource: 'position' });

      expect(response.status).toBe(400);
      expect(firestoreMock.transactions).toBe(0);
    });
  });
});
