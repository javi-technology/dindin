let firestoreMock: any;

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => firestoreMock),
}));

import {
  assetExists,
  listActiveAssetTickers,
} from '../../src/assets/asset.service';

function mockAssetsCollection(
  activeTickers: string[],
  allTickers: string[] = activeTickers,
) {
  firestoreMock = {
    collection: jest.fn((path: string) => {
      if (path !== 'assets') throw new Error(`Unexpected collection: ${path}`);
      return {
        doc: jest.fn((ticker: string) => ({
          get: jest.fn().mockResolvedValue({
            exists: allTickers.includes(ticker),
            data: () =>
              allTickers.includes(ticker)
                ? { ticker, active: activeTickers.includes(ticker) }
                : undefined,
          }),
        })),
        where: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            docs: activeTickers.map((ticker) => ({
              id: ticker,
              data: () => ({ ticker, active: true }),
            })),
          }),
        })),
      };
    }),
  };
}

describe('asset.service', () => {
  describe('assetExists', () => {
    it('deve retornar true quando o ticker existe e está ativo', async () => {
      mockAssetsCollection(['HGLG11']);
      await expect(assetExists('HGLG11')).resolves.toBe(true);
    });

    it('deve retornar false quando o ticker não existe no catálogo', async () => {
      mockAssetsCollection(['HGLG11']);
      await expect(assetExists('INEXISTENTE11')).resolves.toBe(false);
    });

    it('deve retornar false quando o ticker existe mas está inativo', async () => {
      mockAssetsCollection([], ['OLDX11']);
      await expect(assetExists('OLDX11')).resolves.toBe(false);
    });
  });

  describe('listActiveAssetTickers', () => {
    it('deve retornar os tickers de todos os ativos ativos do catálogo', async () => {
      mockAssetsCollection(['HGLG11', 'MXRF11']);
      await expect(listActiveAssetTickers()).resolves.toEqual([
        'HGLG11',
        'MXRF11',
      ]);
    });

    it('deve retornar lista vazia quando não há ativos cadastrados', async () => {
      mockAssetsCollection([]);
      await expect(listActiveAssetTickers()).resolves.toEqual([]);
    });

    it('deve usar o id do documento como fallback quando o campo ticker estiver ausente', async () => {
      firestoreMock = {
        collection: jest.fn((path: string) => {
          if (path !== 'assets')
            throw new Error(`Unexpected collection: ${path}`);
          return {
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                docs: [{ id: 'HGLG11', data: () => ({ active: true }) }],
              }),
            })),
          };
        }),
      };

      await expect(listActiveAssetTickers()).resolves.toEqual(['HGLG11']);
    });
  });
});
