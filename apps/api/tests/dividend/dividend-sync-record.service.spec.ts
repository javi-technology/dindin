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
  // Valor por cota já registrado em cada dia de pagamento.
  recorded?: Record<string, number>;
  positions?: HolderDoc[];
  fridgeItems?: HolderDoc[];
  existingDividends?: ExistingDividend[];
  commitError?: Error;
  // Datas-com com foto guardada e as fotos em si (#278).
  snapshotDates?: string[];
  snapshots?: Record<string, Record<string, number>>;
}) {
  const stateSet = jest.fn().mockResolvedValue(undefined);
  const snapshotSet = jest.fn().mockResolvedValue(undefined);
  const snapshotDelete = jest.fn().mockResolvedValue(undefined);
  const snapshotGet = jest.fn((comDate: string) => {
    const quantities = options.snapshots?.[comDate];
    return Promise.resolve(
      quantities
        ? { exists: true, data: () => ({ quantities, takenAt: 'x' }) }
        : { exists: false, data: () => undefined },
    );
  });
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
          doc: jest.fn((ticker: string) => ({
            get: jest.fn().mockResolvedValue(
              options.recorded
                ? {
                    exists: true,
                    data: () => ({
                      recorded: options.recorded,
                      ...(options.snapshotDates
                        ? { snapshots: options.snapshotDates }
                        : {}),
                    }),
                  }
                : { exists: false, data: () => undefined },
            ),
            set: stateSet,
            collection: jest.fn((sub: string) => ({
              doc: jest.fn((comDate: string) => ({
                path: `dividendSync/${ticker}/${sub}/${comDate}`,
                get: () => snapshotGet(comDate),
                set: (data: unknown) => snapshotSet(comDate, data),
                delete: () => snapshotDelete(comDate),
              })),
            })),
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

  return {
    stateSet,
    batchSet,
    batchCommit,
    groups,
    snapshotSet,
    snapshotDelete,
    snapshotGet,
  };
}

const writtenPaths = (batchSet: jest.Mock) =>
  batchSet.mock.calls.map(([ref]) => ref.path);

describe('DividendSyncRecordService — recordPaidDividends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registra os dias de pagamento ainda não registrados para quem tem o ativo', async () => {
    const { batchSet, stateSet, groups } = setupFirestore({
      recorded: { '2026-08-14': 0.9 },
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
        // Já registrado em execução anterior.
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
    expect(stateSet).toHaveBeenCalledWith({
      recorded: { '2026-08-14': 0.9, '2026-09-14': 0.92 },
      updatedAt: expect.any(String),
    });
  });

  it('não consulta quem tem o ativo quando não há pagamento novo', async () => {
    const { batchSet, stateSet } = setupFirestore({
      recorded: { '2026-09-14': 0.92 },
    });

    const result = await recordPaidDividends(
      'HGLG11',
      [{ paymentDate: '2026-09-14', rate: 0.92 }],
      '2026-09-18',
    );

    expect(result).toEqual([]);
    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(stateSet).not.toHaveBeenCalled();
  });

  it('na primeira execução, registra só os pagamentos de hoje', async () => {
    const { batchSet, stateSet } = setupFirestore({
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
    // Os dias anteriores entram como já registrados, sem gravação retroativa.
    expect(stateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        recorded: { '2026-08-14': 0.9, '2026-09-18': 0.92 },
      }),
    );
  });

  it('na primeira execução sem pagamento hoje, apenas guarda o estado', async () => {
    const { batchSet, stateSet } = setupFirestore({});

    await recordPaidDividends(
      'HGLG11',
      [{ paymentDate: '2026-08-14', rate: 0.9 }],
      '2026-09-18',
    );

    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(stateSet).toHaveBeenCalledWith(
      expect.objectContaining({ recorded: { '2026-08-14': 0.9 } }),
    );
  });

  it('junta num único registro os proventos pagos no mesmo dia', async () => {
    const { batchSet } = setupFirestore({
      recorded: {},
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

  it('regrava o dia quando um provento do mesmo dia chega depois', async () => {
    // Dividendo registrado no dia 15; o JCP do mesmo dia só apareceu na
    // Brapi no dia 16.
    const { batchSet, stateSet } = setupFirestore({
      recorded: { '2026-09-15': 1.25 },
      positions: [{ path: 'users/u1/wallets/w1/positions/p1', quantity: 100 }],
    });

    await recordPaidDividends(
      'PETR4',
      [
        { paymentDate: '2026-09-15', rate: 1.25 },
        { paymentDate: '2026-09-15', rate: 0.5 },
      ],
      '2026-09-16',
    );

    expect(writtenPaths(batchSet)).toEqual([
      'users/u1/dividends/2026-09-15_PETR4',
    ]);
    expect(batchSet.mock.calls[0][1]).toEqual(
      expect.objectContaining({ amountPerShare: 1.75, totalAmount: 175 }),
    );
    expect(stateSet).toHaveBeenCalledWith(
      expect.objectContaining({ recorded: { '2026-09-15': 1.75 } }),
    );
  });

  it('registra um pagamento publicado depois com data anterior à do último registro', async () => {
    const { batchSet } = setupFirestore({
      recorded: { '2026-09-15': 0.92 },
      positions: [{ path: 'users/u1/wallets/w1/positions/p1', quantity: 10 }],
    });

    await recordPaidDividends(
      'HGLG11',
      [
        { paymentDate: '2026-09-14', rate: 0.3 },
        { paymentDate: '2026-09-15', rate: 0.92 },
      ],
      '2026-09-16',
    );

    expect(writtenPaths(batchSet)).toEqual([
      'users/u1/dividends/2026-09-14_HGLG11',
    ]);
  });

  it('respeita lançamento manual e registro do job antigo no mesmo mês', async () => {
    const { batchSet, groups } = setupFirestore({
      recorded: {},
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

  it('não atualiza o estado quando a gravação falha', async () => {
    const { stateSet } = setupFirestore({
      recorded: {},
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
    expect(stateSet).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Quantidade da data-com (#278)
  // -------------------------------------------------------------------------
  describe('quantidade da data-com', () => {
    it('guarda a foto das quantidades quando a data-com chega', async () => {
      const { snapshotSet, stateSet, batchSet } = setupFirestore({
        recorded: {},
        positions: [
          { path: 'users/u1/wallets/w1/positions/p1', quantity: 100 },
          { path: 'users/u2/wallets/w1/positions/p1', quantity: 30 },
        ],
      });

      const result = await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-09-30',
      );

      expect(result).toEqual([]);
      expect(batchSet).not.toHaveBeenCalled();
      expect(snapshotSet).toHaveBeenCalledTimes(1);
      expect(snapshotSet).toHaveBeenCalledWith('2026-09-30', {
        quantities: { u1: 100, u2: 30 },
        takenAt: expect.any(String),
      });
      expect(stateSet).toHaveBeenCalledWith({
        recorded: {},
        snapshots: ['2026-09-30'],
        updatedAt: expect.any(String),
      });
    });

    it('não refaz a foto de uma data-com já guardada', async () => {
      const { snapshotSet, stateSet } = setupFirestore({
        recorded: {},
        snapshotDates: ['2026-09-30'],
      });

      await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-01',
      );

      expect(snapshotSet).not.toHaveBeenCalled();
      expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
      expect(stateSet).not.toHaveBeenCalled();
    });

    it('não sobrescreve a foto gravada quando o estado não chegou a ser salvo', async () => {
      // Execução anterior gravou a foto e falhou antes de salvar o estado.
      const { snapshotSet, stateSet } = setupFirestore({
        recorded: {},
        snapshots: { '2026-09-30': { u1: 100 } },
        positions: [
          // Depois da data-com u1 vendeu e u2 comprou.
          { path: 'users/u2/wallets/w1/positions/p1', quantity: 50 },
        ],
      });

      await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-01',
      );

      expect(snapshotSet).not.toHaveBeenCalled();
      expect(stateSet).toHaveBeenCalledWith({
        recorded: {},
        snapshots: ['2026-09-30'],
        updatedAt: expect.any(String),
      });
    });

    it('não tira foto antes da data-com', async () => {
      const { snapshotSet } = setupFirestore({ recorded: {} });

      await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-09-29',
      );

      expect(snapshotSet).not.toHaveBeenCalled();
    });

    it('registra com a quantidade da data-com quem vendeu antes do pagamento', async () => {
      const { batchSet } = setupFirestore({
        recorded: {},
        snapshotDates: ['2026-09-30'],
        snapshots: { '2026-09-30': { u1: 100 } },
        // u1 vendeu tudo depois da data-com.
        positions: [],
      });

      const result = await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-14',
      );

      expect(result).toEqual([
        expect.objectContaining({
          id: '2026-10-14_HGLG11',
          userId: 'u1',
          quantity: 100,
          totalAmount: 110,
        }),
      ]);
      expect(writtenPaths(batchSet)).toEqual([
        'users/u1/dividends/2026-10-14_HGLG11',
      ]);
    });

    it('não registra para quem comprou depois da data-com', async () => {
      setupFirestore({
        recorded: {},
        snapshotDates: ['2026-09-30'],
        snapshots: { '2026-09-30': { u1: 100 } },
        positions: [
          // u1 comprou mais depois da data-com: vale a quantidade da foto.
          { path: 'users/u1/wallets/w1/positions/p1', quantity: 150 },
          { path: 'users/u2/wallets/w1/positions/p1', quantity: 50 },
        ],
      });

      const result = await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-14',
      );

      expect(result).toEqual([
        expect.objectContaining({ userId: 'u1', quantity: 100 }),
      ]);
    });

    it('usa a quantidade do dia do pagamento em evento sem data-com', async () => {
      setupFirestore({
        recorded: {},
        snapshotDates: ['2026-09-30'],
        snapshots: { '2026-09-30': { u1: 100 } },
        positions: [
          { path: 'users/u1/wallets/w1/positions/p1', quantity: 150 },
          { path: 'users/u2/wallets/w1/positions/p1', quantity: 50 },
        ],
      });

      const result = await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1 }],
        '2026-10-14',
      );

      expect(result).toEqual([
        expect.objectContaining({ userId: 'u1', quantity: 150 }),
        expect.objectContaining({ userId: 'u2', quantity: 50 }),
      ]);
    });

    it('usa a quantidade do dia do pagamento quando a foto não existe', async () => {
      // Data-com anterior ao deploy ou sync que não rodou no dia.
      setupFirestore({
        recorded: {},
        positions: [{ path: 'users/u2/wallets/w1/positions/p1', quantity: 50 }],
      });

      const result = await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-14',
      );

      expect(result).toEqual([
        expect.objectContaining({ userId: 'u2', quantity: 50 }),
      ]);
    });

    it('apaga a foto que saiu da janela de eventos', async () => {
      const { snapshotDelete, stateSet } = setupFirestore({
        recorded: { '2026-10-14': 1.1 },
        snapshotDates: ['2025-08-29', '2026-09-30'],
      });

      await recordPaidDividends(
        'HGLG11',
        [{ paymentDate: '2026-10-14', rate: 1.1, comDate: '2026-09-30' }],
        '2026-10-20',
      );

      expect(snapshotDelete).toHaveBeenCalledTimes(1);
      expect(snapshotDelete).toHaveBeenCalledWith('2025-08-29');
      expect(stateSet).toHaveBeenCalledWith({
        recorded: { '2026-10-14': 1.1 },
        snapshots: ['2026-09-30'],
        updatedAt: expect.any(String),
      });
    });
  });
});
