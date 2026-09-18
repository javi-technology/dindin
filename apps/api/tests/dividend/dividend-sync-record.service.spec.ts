let firestoreMock: any;

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

import { recordPaidDividends } from '../../src/dividend/dividend-sync-record.service';

interface HolderDoc {
  path: string;
  quantity: unknown;
}

interface ExistingDividend {
  path: string;
  data: Record<string, unknown>;
}

function queryResult(docs: unknown[]) {
  const query = {
    where: jest.fn(),
    get: jest.fn().mockResolvedValue({ docs }),
  };
  query.where.mockReturnValue(query);
  return query;
}

function setupFirestore(options: {
  cursor?: string;
  positions?: HolderDoc[];
  fridgeItems?: HolderDoc[];
  existingDividends?: ExistingDividend[];
  commitError?: Error;
}) {
  const cursorSet = jest.fn().mockResolvedValue(undefined);
  const batchSet = jest.fn();
  const batchCommit = options.commitError
    ? jest.fn().mockRejectedValue(options.commitError)
    : jest.fn().mockResolvedValue(undefined);

  const holders = (docs: HolderDoc[] = []) =>
    queryResult(
      docs.map(({ path, quantity }) => ({
        ref: { path },
        data: () => ({ quantity }),
      })),
    );
  const groups: Record<string, ReturnType<typeof queryResult>> = {
    positions: holders(options.positions),
    fridgeItems: holders(options.fridgeItems),
    dividends: queryResult(
      (options.existingDividends ?? []).map(({ path, data }) => ({
        id: path.split('/').pop(),
        ref: { path },
        data: () => data,
      })),
    ),
  };

  firestoreMock = {
    collection: jest.fn((name: string) => {
      if (name === 'dividendSync') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              options.cursor
                ? {
                    exists: true,
                    data: () => ({ recordedThrough: options.cursor }),
                  }
                : { exists: false, data: () => undefined },
            ),
            set: cursorSet,
          })),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => ({
            collection: jest.fn((sub: string) => ({
              doc: jest.fn((id: string) => ({
                path: `users/${userId}/${sub}/${id}`,
              })),
            })),
          })),
        };
      }
      throw new Error(`Coleção inesperada: ${name}`);
    }),
    collectionGroup: jest.fn((name: string) => {
      if (!groups[name]) throw new Error(`Grupo inesperado: ${name}`);
      return groups[name];
    }),
    batch: jest.fn(() => ({ set: batchSet, commit: batchCommit })),
  };

  return { cursorSet, batchSet, batchCommit, groups };
}

const writtenPaths = (batchSet: jest.Mock) =>
  batchSet.mock.calls.map(([ref]) => ref.path);

describe('DividendSyncRecordService — recordPaidDividends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registra os eventos pagos depois do cursor para quem tem o ativo', async () => {
    const { batchSet, cursorSet, groups } = setupFirestore({
      cursor: '2026-09-10',
      positions: [
        { path: 'users/u1/wallets/w1/positions/p1', quantity: 100 },
        { path: 'users/u1/wallets/w2/positions/p2', quantity: 20 },
        { path: 'users/u2/wallets/w1/positions/p1', quantity: 0 },
      ],
      fridgeItems: [
        { path: 'users/u1/fridges/f1/fridgeItems/i1', quantity: 10 },
        { path: 'users/u3/fridges/f1/fridgeItems/i1', quantity: 5 },
      ],
    });

    const result = await recordPaidDividends(
      'HGLG11',
      [
        // Já registrado em execução anterior (antes do cursor).
        { paymentDate: '2026-08-14', rate: 0.9 },
        { paymentDate: '2026-09-14', rate: 0.92 },
      ],
      '2026-09-18',
    );

    expect(groups.positions.where).toHaveBeenCalledWith(
      'ticker',
      '==',
      'HGLG11',
    );
    expect(groups.fridgeItems.where).toHaveBeenCalledWith(
      'ticker',
      '==',
      'HGLG11',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: '2026-09-14_HGLG11',
        userId: 'u1',
        quantity: 130,
        totalAmount: 119.6,
      }),
      expect.objectContaining({
        id: '2026-09-14_HGLG11',
        userId: 'u3',
        quantity: 5,
        totalAmount: 4.6,
      }),
    ]);
    expect(writtenPaths(batchSet)).toEqual([
      'users/u1/dividends/2026-09-14_HGLG11',
      'users/u3/dividends/2026-09-14_HGLG11',
    ]);
    expect(batchSet.mock.calls[0][1]).toEqual({
      userId: 'u1',
      ticker: 'HGLG11',
      amountPerShare: 0.92,
      quantity: 130,
      totalAmount: 119.6,
      paymentDate: '2026-09-14',
      source: 'auto',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(cursorSet).toHaveBeenCalledWith({
      recordedThrough: '2026-09-18',
      updatedAt: expect.any(String),
    });
  });

  it('não consulta quem tem o ativo quando não há pagamento novo', async () => {
    const { batchSet, cursorSet } = setupFirestore({ cursor: '2026-09-14' });

    const result = await recordPaidDividends(
      'HGLG11',
      [{ paymentDate: '2026-09-14', rate: 0.92 }],
      '2026-09-18',
    );

    expect(result).toEqual([]);
    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(cursorSet).not.toHaveBeenCalled();
  });

  it('sem cursor, registra só os pagamentos de hoje e inicia o cursor', async () => {
    const { batchSet, cursorSet } = setupFirestore({
      positions: [{ path: 'users/u1/wallets/w1/positions/p1', quantity: 10 }],
    });

    await recordPaidDividends(
      'HGLG11',
      [
        { paymentDate: '2026-08-14', rate: 0.9 },
        { paymentDate: '2026-09-18', rate: 0.92 },
      ],
      '2026-09-18',
    );

    expect(writtenPaths(batchSet)).toEqual([
      'users/u1/dividends/2026-09-18_HGLG11',
    ]);
    expect(cursorSet).toHaveBeenCalledWith(
      expect.objectContaining({ recordedThrough: '2026-09-18' }),
    );
  });

  it('sem cursor e sem pagamento hoje, apenas inicia o cursor', async () => {
    const { batchSet, cursorSet } = setupFirestore({});

    await recordPaidDividends(
      'HGLG11',
      [{ paymentDate: '2026-08-14', rate: 0.9 }],
      '2026-09-18',
    );

    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(cursorSet).toHaveBeenCalledWith(
      expect.objectContaining({ recordedThrough: '2026-09-18' }),
    );
  });

  it('junta num único registro os proventos pagos no mesmo dia', async () => {
    const { batchSet } = setupFirestore({
      cursor: '2026-09-10',
      positions: [{ path: 'users/u1/wallets/w1/positions/p1', quantity: 100 }],
    });

    await recordPaidDividends(
      'PETR4',
      [
        { paymentDate: '2026-09-15', rate: 1.25 },
        { paymentDate: '2026-09-15', rate: 0.5 },
      ],
      '2026-09-18',
    );

    expect(batchSet).toHaveBeenCalledTimes(1);
    expect(batchSet.mock.calls[0][1]).toEqual(
      expect.objectContaining({ amountPerShare: 1.75, totalAmount: 175 }),
    );
  });

  it('respeita lançamento manual e registro do job antigo no mesmo mês', async () => {
    const { batchSet, groups } = setupFirestore({
      cursor: '2026-09-10',
      positions: [
        { path: 'users/manual/wallets/w1/positions/p1', quantity: 10 },
        { path: 'users/legado/wallets/w1/positions/p1', quantity: 10 },
        { path: 'users/novo/wallets/w1/positions/p1', quantity: 10 },
      ],
      existingDividends: [
        {
          path: 'users/manual/dividends/abc123',
          data: {
            ticker: 'HGLG11',
            source: 'manual',
            paymentDate: '2026-09-02',
          },
        },
        {
          path: 'users/legado/dividends/2026-09_HGLG11',
          data: { ticker: 'HGLG11', source: 'auto', paymentDate: '2026-09-01' },
        },
        // Registro por evento de outro dia não bloqueia o mês.
        {
          path: 'users/novo/dividends/2026-09-02_HGLG11',
          data: { ticker: 'HGLG11', source: 'auto', paymentDate: '2026-09-02' },
        },
      ],
    });

    await recordPaidDividends(
      'HGLG11',
      [{ paymentDate: '2026-09-14', rate: 0.92 }],
      '2026-09-18',
    );

    expect(groups.dividends.where).toHaveBeenCalledWith(
      'ticker',
      '==',
      'HGLG11',
    );
    expect(groups.dividends.where).toHaveBeenCalledWith(
      'paymentDate',
      '>=',
      '2026-09-01',
    );
    expect(groups.dividends.where).toHaveBeenCalledWith(
      'paymentDate',
      '<=',
      '2026-09-31',
    );
    expect(writtenPaths(batchSet)).toEqual([
      'users/novo/dividends/2026-09-14_HGLG11',
    ]);
  });

  it('não avança o cursor quando a gravação falha', async () => {
    const { cursorSet } = setupFirestore({
      cursor: '2026-09-10',
      positions: [{ path: 'users/u1/wallets/w1/positions/p1', quantity: 10 }],
      commitError: new Error('falha no Firestore'),
    });

    await expect(
      recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-09-14', rate: 0.92 }],
        '2026-09-18',
      ),
    ).rejects.toThrow('falha no Firestore');
    expect(cursorSet).not.toHaveBeenCalled();
  });
});
