let firestoreMock: any;
const assetExistsMock = jest.fn();
const parseBbFiiPdfMock = jest.fn();
const parseBbFileNameMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => firestoreMock),
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(),
}));

jest.mock('../../src/assets/asset.service', () => ({
  assetExists: (...args: unknown[]) => assetExistsMock(...args),
}));

jest.mock('../../src/recommended-wallet/bb-pdf.parser', () => ({
  parseBbFiiPdf: (...args: unknown[]) => parseBbFiiPdfMock(...args),
  parseBbFileName: (...args: unknown[]) => parseBbFileNameMock(...args),
}));

import {
  compareWithWallet,
  importBbWallet,
  persistRecommendedWallet,
  recommendedWalletId,
} from '../../src/recommended-wallet/recommended-wallet.service';

describe('recommended-wallet.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parseBbFileNameMock.mockReturnValue({
      month: '2026-09',
      revision: 2,
    });
    parseBbFiiPdfMock.mockResolvedValue({
      publishedAt: '2026-09-02',
      renda: [
        {
          ticker: 'RZTR11',
          segment: 'Agronegócio',
          weight: 0.5,
          closePrice: 88.04,
          ifixWeight: 0.0107,
        },
        {
          ticker: 'MXRF11',
          segment: 'Recebíveis',
          weight: 0.5,
          closePrice: 9.18,
          ifixWeight: 0.02,
        },
      ],
      ganho: [],
    });
    assetExistsMock.mockResolvedValue(true);
  });

  it('deve gerar o id genérico da carteira BB', () => {
    expect(recommendedWalletId('2026-09')).toBe('bb-fii_2026-09');
  });

  it('deve importar uma carteira com renda, ganho e status pendente', async () => {
    const docRef = {
      get: jest.fn().mockResolvedValue({
        exists: false,
        data: () => undefined,
      }),
    };
    const transaction = {
      get: jest.fn().mockResolvedValue({
        exists: false,
        data: () => undefined,
      }),
      set: jest.fn(),
    };
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => docRef),
      })),
      runTransaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(transaction),
      ),
    };

    const result = await importBbWallet(
      Buffer.from('pdf'),
      'wallets/fii-bb/CartFII_Set26_2.pdf',
    );

    expect(result).toMatchObject({
      id: 'bb-fii_2026-09',
      status: 'pending_review',
      sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
      renda: expect.any(Array),
      ganho: [],
    });
    expect(transaction.set).toHaveBeenCalledWith(docRef, result);
  });

  it('deve ignorar revisão antiga sem sobrescrever a carteira atual', async () => {
    const existing = {
      id: 'bb-fii_2026-09',
      revision: 3,
      status: 'confirmed',
      createdAt: '2026-09-01T00:00:00Z',
    };
    const docRef = {};
    const transaction = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => existing,
      }),
      set: jest.fn(),
    };
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => docRef),
      })),
      runTransaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(transaction),
      ),
    };

    const result = await persistRecommendedWallet({
      ...existing,
      month: '2026-09',
      provider: 'BB',
      sourceFile: 'wallets/fii-bb/CartFII_Set26_2.pdf',
      renda: [],
      ganho: [],
      publishedAt: '2026-09-02',
      parsedAt: '2026-09-04T00:00:00Z',
      updatedAt: '2026-09-04T00:00:00Z',
    } as never);

    expect(result).toEqual(existing);
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('deve preservar confirmação ao processar novamente a mesma revisão', async () => {
    const existing = {
      id: 'bb-fii_2026-09',
      revision: 2,
      status: 'confirmed',
      changes: { renda: { entering: [], leaving: [] } },
      createdAt: '2026-09-01T00:00:00Z',
    };
    const docRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => existing,
      }),
    };
    const transaction = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => existing,
      }),
      set: jest.fn(),
    };
    firestoreMock = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => docRef),
      })),
      runTransaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(transaction),
      ),
    };

    const result = await importBbWallet(
      Buffer.from('pdf'),
      'wallets/fii-bb/CartFII_Set26_2.pdf',
    );

    expect(result).toEqual(existing);
    expect(parseBbFiiPdfMock).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('deve comparar posições atuais com a renda recomendada', async () => {
    const recommended = {
      id: 'bb-fii_2026-09',
      month: '2026-09',
      renda: [
        {
          ticker: 'RZTR11',
          weight: 0.5,
        },
        {
          ticker: 'MXRF11',
          weight: 0.5,
        },
      ],
      ganho: [],
    };
    const recommendedDoc = {
      exists: true,
      data: () => recommended,
    };
    const positions = [
      {
        id: 'p1',
        ticker: 'MXRF11',
        quantity: 10,
        averagePrice: 8,
      },
      {
        id: 'p2',
        ticker: 'XPML11',
        quantity: 5,
        averagePrice: 100,
      },
    ];
    const walletPositions = {
      get: jest.fn().mockResolvedValue({
        docs: positions.map((position) => ({
          id: position.id,
          data: () => position,
        })),
      }),
    };
    const users = {
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => walletPositions),
          })),
        })),
      })),
    };
    // As cotações passaram a ser buscadas por ticker, com getAll (issue #299).
    const quotePrices: Record<string, { price: number }> = {
      MXRF11: { price: 9.18 },
    };
    const quotes = { doc: jest.fn((ticker: string) => ({ id: ticker })) };
    firestoreMock = {
      getAll: jest.fn(async (...refs: { id: string }[]) =>
        refs.map((ref) => ({
          id: ref.id,
          exists: quotePrices[ref.id] !== undefined,
          data: () => quotePrices[ref.id],
        })),
      ),
      collection: jest.fn((name: string) => {
        if (name === 'recommendedWallets') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(recommendedDoc),
            })),
          };
        }
        if (name === 'users') return users;
        if (name === 'quotes') return quotes;
        throw new Error(`Coleção inesperada: ${name}`);
      }),
    };

    const result = await compareWithWallet('user-1', 'wallet-1', '2026-09');

    expect(result.totalValue).toBe(591.8);
    expect(result.items).toEqual([
      {
        ticker: 'MXRF11',
        recommendedWeight: 0.5,
        currentWeight: 0.15511997296383914,
        quantity: 10,
        currentValue: 91.8,
        status: 'match',
      },
      {
        ticker: 'RZTR11',
        recommendedWeight: 0.5,
        currentWeight: null,
        quantity: 0,
        currentValue: 0,
        status: 'missing',
      },
      {
        ticker: 'XPML11',
        recommendedWeight: null,
        currentWeight: 0.8448800270361609,
        quantity: 5,
        currentValue: 500,
        status: 'extra',
      },
    ]);
  });

  describe('reimportação para preencher as entradas e saídas (issue #586)', () => {
    const changes = {
      renda: { entering: ['KNCR11'], leaving: ['RZTR11'] },
    };
    const gravada = {
      id: 'bb-fii_2026-09',
      revision: 2,
      status: 'confirmed',
      confirmedAt: '2026-09-03T00:00:00Z',
      renda: [{ ticker: 'KNCR11' }],
      ganho: [],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    };

    function montar(existente: Record<string, unknown>) {
      const docRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => existente,
        }),
      };
      const transaction = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => existente,
        }),
        set: jest.fn(),
        update: jest.fn(),
      };
      firestoreMock = {
        collection: jest.fn(() => ({ doc: jest.fn(() => docRef) })),
        runTransaction: jest.fn((callback: (tx: unknown) => unknown) =>
          callback(transaction),
        ),
      };
      return { docRef, transaction };
    }

    const reenviar = () =>
      importBbWallet(Buffer.from('pdf'), 'wallets/fii-bb/CartFII_Set26_2.pdf');

    it('preenche só as entradas e saídas do documento que não as tem', async () => {
      parseBbFiiPdfMock.mockResolvedValue({
        publishedAt: '2026-09-02',
        renda: [],
        ganho: [],
        changes,
      });
      const { docRef, transaction } = montar(gravada);

      const result = await reenviar();

      expect(transaction.set).not.toHaveBeenCalled();
      expect(transaction.update).toHaveBeenCalledWith(docRef, {
        changes,
        updatedAt: expect.any(String),
      });
      expect(result).toMatchObject({
        status: 'confirmed',
        confirmedAt: '2026-09-03T00:00:00Z',
        renda: [{ ticker: 'KNCR11' }],
        changes,
      });
    });

    it('não faz nada no documento que já as tem', async () => {
      const { transaction } = montar({ ...gravada, changes });

      await reenviar();

      expect(parseBbFiiPdfMock).not.toHaveBeenCalled();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('não grava quando o PDF também não informa', async () => {
      parseBbFiiPdfMock.mockResolvedValue({
        publishedAt: '2026-09-02',
        renda: [],
        ganho: [],
      });
      const { transaction } = montar(gravada);

      const result = await reenviar();

      expect(transaction.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'confirmed' });
    });

    it('mantém o documento quando o PDF reenviado não pode ser lido', async () => {
      parseBbFiiPdfMock.mockRejectedValue(new Error('PDF ilegível'));
      const { transaction } = montar(gravada);

      const result = await reenviar();

      expect(transaction.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'confirmed' });
    });

    it('não preenche a partir de revisão mais antiga que a gravada', async () => {
      const { transaction } = montar({ ...gravada, revision: 3 });

      await reenviar();

      expect(parseBbFiiPdfMock).not.toHaveBeenCalled();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('grava as entradas e saídas numa importação nova', async () => {
      parseBbFiiPdfMock.mockResolvedValue({
        publishedAt: '2026-09-02',
        renda: [],
        ganho: [],
        changes,
      });
      const { transaction } = montar(gravada);
      const naoExiste = { exists: false, data: () => undefined };
      transaction.get.mockResolvedValue(naoExiste);
      (firestoreMock.collection as jest.Mock).mockReturnValue({
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(naoExiste) })),
      });

      const result = await reenviar();

      expect(result.changes).toEqual(changes);
    });
  });
});
