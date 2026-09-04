let bucketMock: any;

jest.mock('firebase-admin', () => ({
  storage: jest.fn(() => ({ bucket: () => bucketMock })),
}));

import {
  bbPdfExists,
  downloadBbPdf,
  saveBbPdf,
} from '../../src/recommended-wallet/storage.service';

describe('storage.service', () => {
  beforeEach(() => {
    bucketMock = {
      file: jest.fn(() => ({
        save: jest.fn().mockResolvedValue(undefined),
        download: jest.fn().mockResolvedValue([Buffer.from('pdf')]),
        exists: jest.fn().mockResolvedValue([true]),
      })),
    };
  });

  it('deve salvar o PDF no prefixo do BB', async () => {
    await expect(
      saveBbPdf('CartFII_Set26.pdf', Buffer.from('pdf')),
    ).resolves.toBe('wallets/fii-bb/CartFII_Set26.pdf');
    expect(bucketMock.file).toHaveBeenCalledWith(
      'wallets/fii-bb/CartFII_Set26.pdf',
    );
  });

  it('deve baixar e verificar existência do PDF', async () => {
    await expect(downloadBbPdf('wallets/fii-bb/a.pdf')).resolves.toEqual(
      Buffer.from('pdf'),
    );
    await expect(bbPdfExists('wallets/fii-bb/a.pdf')).resolves.toBe(true);
  });
});
