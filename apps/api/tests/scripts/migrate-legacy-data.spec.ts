const getFirestoreMock = jest.fn();

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: () => getFirestoreMock(),
  FieldValue: { delete: () => '__DELETE__' },
}));

jest.mock('firebase-functions/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  write: jest.fn(),
}));

import {
  isMissingCredentialsError,
  migrateLegacyAutoDividends,
  removeLegacyCurrentPrice,
} from '../../src/scripts/migrate-legacy-data';

// ---------------------------------------------------------------------------
// Migração dos dados legados (issue #326)
//
// Dois resíduos ficaram no banco depois de mudanças anteriores:
//
// 1. `currentPrice` denormalizado em posições e itens. A #86 passou a resolver
//    o preço na leitura, mas o campo antigo continuou gravado — e congelado.
// 2. Proventos automáticos com o id do job mensal antigo (`YYYY-MM_TICKER`),
//    enquanto o sync atual usa `YYYY-MM-DD_TICKER`. Enquanto existirem, o
//    `dividend-sync-record` precisa do tratamento especial `LEGACY_AUTO_ID`.
//
// O script é idempotente e simula por padrão: escreve só com `apply: true`.
// ---------------------------------------------------------------------------

interface FakeDoc {
  id: string;
  path: string;
  data: Record<string, unknown>;
}

function createFirestore(docsByGroup: Record<string, FakeDoc[]>) {
  const writes: { op: string; path: string; data?: unknown }[] = [];
  const existingIds = new Set<string>();

  const docRef = (path: string, id: string) => ({
    id,
    path,
    get: jest.fn().mockResolvedValue({ exists: existingIds.has(path) }),
  });

  const batch = () => ({
    update: jest.fn((ref: { path: string }, data: unknown) => {
      writes.push({ op: 'update', path: ref.path, data });
    }),
    set: jest.fn((ref: { path: string }, data: unknown) => {
      writes.push({ op: 'set', path: ref.path, data });
    }),
    delete: jest.fn((ref: { path: string }) => {
      writes.push({ op: 'delete', path: ref.path });
    }),
    commit: jest.fn().mockResolvedValue(undefined),
  });

  const firestore = {
    collectionGroup: jest.fn((name: string) => ({
      get: jest.fn().mockResolvedValue({
        docs: (docsByGroup[name] ?? []).map((doc) => ({
          id: doc.id,
          ref: {
            ...docRef(doc.path, doc.id),
            parent: {
              doc: jest.fn((newId: string) =>
                docRef(doc.path.replace(/[^/]+$/, newId), newId),
              ),
            },
          },
          data: () => doc.data,
        })),
      }),
      where: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(batch),
  };

  getFirestoreMock.mockReturnValue(firestore);
  return { writes, existingIds };
}

describe('scripts/migrate-legacy-data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('removeLegacyCurrentPrice', () => {
    const docs = {
      positions: [
        {
          id: 'p1',
          path: 'users/u1/wallets/w1/positions/p1',
          data: { ticker: 'HGLG11', currentPrice: 110 },
        },
        {
          id: 'p2',
          path: 'users/u1/wallets/w1/positions/p2',
          data: { ticker: 'XPML11' },
        },
      ],
      fridgeItems: [
        {
          id: 'i1',
          path: 'users/u1/fridges/f1/fridgeItems/i1',
          data: { ticker: 'KNCR11', currentPrice: 95 },
        },
      ],
    };

    it('deve contar os documentos afetados sem escrever na simulação', async () => {
      const { writes } = createFirestore(docs);

      const result = await removeLegacyCurrentPrice({ apply: false });

      expect(result).toEqual({ positions: 1, fridgeItems: 1 });
      expect(writes).toHaveLength(0);
    });

    it('deve apagar o campo apenas de quem o tem', async () => {
      const { writes } = createFirestore(docs);

      const result = await removeLegacyCurrentPrice({ apply: true });

      expect(result).toEqual({ positions: 1, fridgeItems: 1 });
      expect(writes).toEqual([
        {
          op: 'update',
          path: 'users/u1/wallets/w1/positions/p1',
          data: { currentPrice: '__DELETE__' },
        },
        {
          op: 'update',
          path: 'users/u1/fridges/f1/fridgeItems/i1',
          data: { currentPrice: '__DELETE__' },
        },
      ]);
    });

    it('deve ser idempotente: nada a fazer quando o campo já saiu', async () => {
      const { writes } = createFirestore({
        positions: [
          {
            id: 'p2',
            path: 'users/u1/wallets/w1/positions/p2',
            data: { ticker: 'XPML11' },
          },
        ],
      });

      const result = await removeLegacyCurrentPrice({ apply: true });

      expect(result).toEqual({ positions: 0, fridgeItems: 0 });
      expect(writes).toHaveLength(0);
    });
  });

  describe('migrateLegacyAutoDividends', () => {
    const legacy = {
      dividends: [
        {
          id: '2026-08_HGLG11',
          path: 'users/u1/dividends/2026-08_HGLG11',
          data: {
            ticker: 'HGLG11',
            source: 'auto',
            paymentDate: '2026-08-14',
            amountPerShare: 1.1,
            quantity: 10,
          },
        },
        {
          id: '2026-08-14_XPML11',
          path: 'users/u1/dividends/2026-08-14_XPML11',
          data: { ticker: 'XPML11', source: 'auto', paymentDate: '2026-08-14' },
        },
        {
          id: 'manual-1',
          path: 'users/u1/dividends/manual-1',
          data: { ticker: 'KNCR11', paymentDate: '2026-08-10' },
        },
      ],
    };

    it('deve contar sem escrever na simulação', async () => {
      const { writes } = createFirestore(legacy);

      const result = await migrateLegacyAutoDividends({ apply: false });

      expect(result).toEqual({ migrated: 1, skipped: 0 });
      expect(writes).toHaveLength(0);
    });

    // O id novo é derivado da data de pagamento, como o sync atual faz.
    it('deve regravar com o id novo e apagar o antigo', async () => {
      const { writes } = createFirestore(legacy);

      const result = await migrateLegacyAutoDividends({ apply: true });

      expect(result).toEqual({ migrated: 1, skipped: 0 });
      expect(writes).toEqual([
        {
          op: 'set',
          path: 'users/u1/dividends/2026-08-14_HGLG11',
          data: expect.objectContaining({
            ticker: 'HGLG11',
            source: 'auto',
            paymentDate: '2026-08-14',
          }),
        },
        { op: 'delete', path: 'users/u1/dividends/2026-08_HGLG11' },
      ]);
    });

    // Rodar de novo não pode duplicar nem sobrescrever o registro já migrado.
    it('deve pular quando o destino já existe', async () => {
      const { writes, existingIds } = createFirestore(legacy);
      existingIds.add('users/u1/dividends/2026-08-14_HGLG11');

      const result = await migrateLegacyAutoDividends({ apply: true });

      expect(result).toEqual({ migrated: 0, skipped: 1 });
      expect(writes).toEqual([
        { op: 'delete', path: 'users/u1/dividends/2026-08_HGLG11' },
      ]);
    });

    it('não deve tocar em provento manual nem no formato novo', async () => {
      const { writes } = createFirestore({
        dividends: [legacy.dividends[1], legacy.dividends[2]],
      });

      const result = await migrateLegacyAutoDividends({ apply: true });

      expect(result).toEqual({ migrated: 0, skipped: 0 });
      expect(writes).toHaveLength(0);
    });

    // Sem data de pagamento não dá para derivar o id novo.
    it('deve pular registro legado sem data de pagamento', async () => {
      const { writes } = createFirestore({
        dividends: [
          {
            id: '2026-08_SEMDATA',
            path: 'users/u1/dividends/2026-08_SEMDATA',
            data: { ticker: 'SEMDATA', source: 'auto' },
          },
        ],
      });

      const result = await migrateLegacyAutoDividends({ apply: true });

      expect(result).toEqual({ migrated: 0, skipped: 1 });
      expect(writes).toHaveLength(0);
    });
  });

  // Sem credenciais o google-auth lança um stack longo e pouco acionável; o
  // script precisa reconhecer esse caso e dizer o que fazer.
  describe('isMissingCredentialsError', () => {
    it('deve reconhecer a falta de Application Default Credentials', () => {
      const error = new Error(
        'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started',
      );

      expect(isMissingCredentialsError(error)).toBe(true);
    });

    it('deve reconhecer a falta de projeto configurado', () => {
      expect(
        isMissingCredentialsError(new Error('Unable to detect a Project Id')),
      ).toBe(true);
    });

    it('não deve confundir com outras falhas', () => {
      expect(isMissingCredentialsError(new Error('Firestore caiu'))).toBe(
        false,
      );
      expect(isMissingCredentialsError('texto solto')).toBe(false);
    });
  });
});
