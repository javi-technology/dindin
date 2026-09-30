let firestoreMock: any;

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

import {
  DEFAULT_RECOMMENDED_WALLET_SLUG,
  RECOMMENDED_WALLET_PROVIDERS,
  findRecommendedWalletProvider,
} from '../../src/recommended-wallet/providers';
import {
  getRecommendedWallet,
  listRecommendedWallets,
  recommendedWalletId,
} from '../../src/recommended-wallet/recommended-wallet.service';

/**
 * A carteira sugerida deixou de ser "a do BB" (issue #395): o provedor é
 * parâmetro, e os documentos de cada um ficam separados pelo prefixo do id.
 */
describe('carteiras sugeridas por provedor', () => {
  let docMock: jest.Mock;
  let getMock: jest.Mock;
  let rangeGetMock: jest.Mock;
  let orderByMock: jest.Mock;
  let startAtMock: jest.Mock;
  let endAtMock: jest.Mock;
  let limitMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = jest
      .fn()
      .mockResolvedValue({ exists: false, data: () => undefined });
    docMock = jest.fn(() => ({ get: getMock }));
    rangeGetMock = jest.fn().mockResolvedValue({ docs: [] });
    limitMock = jest.fn(() => ({ get: rangeGetMock }));
    endAtMock = jest.fn(() => ({ limit: limitMock, get: rangeGetMock }));
    startAtMock = jest.fn(() => ({ endAt: endAtMock }));
    orderByMock = jest.fn(() => ({ startAt: startAtMock }));
    firestoreMock = {
      collection: jest.fn(() => ({ doc: docMock, orderBy: orderByMock })),
    };
  });

  it('deve expor o BB como provedor padrão do catálogo', () => {
    expect(DEFAULT_RECOMMENDED_WALLET_SLUG).toBe('bb-fii');
    expect(
      findRecommendedWalletProvider(DEFAULT_RECOMMENDED_WALLET_SLUG),
    ).toEqual(expect.objectContaining({ slug: 'bb-fii', provider: 'BB' }));
    expect(RECOMMENDED_WALLET_PROVIDERS.length).toBeGreaterThan(0);
  });

  it('deve devolver indefinido para provedor fora do catálogo', () => {
    expect(findRecommendedWalletProvider('nao-existe')).toBeUndefined();
  });

  it('deve montar o id da carteira com o provedor informado', () => {
    expect(recommendedWalletId('2026-09')).toBe('bb-fii_2026-09');
    expect(recommendedWalletId('2026-09', 'xp-fii')).toBe('xp-fii_2026-09');
  });

  it('deve buscar o mês pedido no provedor informado', async () => {
    await getRecommendedWallet('2026-09', 'xp-fii');

    expect(docMock).toHaveBeenCalledWith('xp-fii_2026-09');
  });

  // O emulador do Firestore não executa varredura decrescente por chave
  // (`FAILED_PRECONDITION`, issue #485): a consulta é crescente e a ordem
  // "mais recente primeiro" sai em memória.
  it('deve consultar o provedor em ordem crescente, sem varredura decrescente', async () => {
    await listRecommendedWallets('xp-fii');

    expect(orderByMock).toHaveBeenCalledTimes(1);
    expect(orderByMock.mock.calls[0]).toHaveLength(1);
    expect(startAtMock).toHaveBeenCalledWith('xp-fii_');
    expect(endAtMock).toHaveBeenCalledWith('xp-fii_\uf8ff');
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('deve buscar a mais recente dentro do provedor informado', async () => {
    rangeGetMock.mockResolvedValue({
      docs: [
        { id: 'xp-fii_2026-07', data: () => ({ month: '2026-07' }) },
        { id: 'xp-fii_2026-09', data: () => ({ month: '2026-09' }) },
      ],
    });

    const wallet = await getRecommendedWallet(undefined, 'xp-fii');

    expect(startAtMock).toHaveBeenCalledWith('xp-fii_');
    expect(endAtMock).toHaveBeenCalledWith('xp-fii_\uf8ff');
    expect(wallet).toEqual(expect.objectContaining({ id: 'xp-fii_2026-09' }));
  });

  it('deve devolver nulo quando o provedor não tem carteira', async () => {
    expect(await getRecommendedWallet(undefined, 'xp-fii')).toBeNull();
  });

  it('deve usar o provedor padrão quando nenhum é informado', async () => {
    await getRecommendedWallet();

    expect(startAtMock).toHaveBeenCalledWith('bb-fii_');
    expect(endAtMock).toHaveBeenCalledWith('bb-fii_\uf8ff');
  });

  it('deve listar apenas as carteiras do provedor informado', async () => {
    rangeGetMock.mockResolvedValue({
      docs: [{ id: 'xp-fii_2026-09', data: () => ({ month: '2026-09' }) }],
    });

    const wallets = await listRecommendedWallets('xp-fii');

    expect(startAtMock).toHaveBeenCalledWith('xp-fii_');
    expect(wallets).toEqual([
      expect.objectContaining({ id: 'xp-fii_2026-09' }),
    ]);
  });

  it('deve listar da mais recente para a mais antiga', async () => {
    rangeGetMock.mockResolvedValue({
      docs: [
        { id: 'xp-fii_2026-07', data: () => ({ month: '2026-07' }) },
        { id: 'xp-fii_2026-08', data: () => ({ month: '2026-08' }) },
        { id: 'xp-fii_2026-09', data: () => ({ month: '2026-09' }) },
      ],
    });

    const wallets = await listRecommendedWallets('xp-fii');

    expect(wallets.map((w) => w.month)).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ]);
  });
});
