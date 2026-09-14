import { getStorage } from 'firebase-admin/storage';

export const BB_WALLET_PREFIX = 'wallets/fii-bb/';

export async function saveBbPdf(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const path = `${BB_WALLET_PREFIX}${fileName}`;
  await getStorage()
    .bucket()
    .file(path)
    .save(buffer, { contentType: 'application/pdf' });
  return path;
}

export async function downloadBbPdf(path: string): Promise<Buffer> {
  const [buffer] = await getStorage().bucket().file(path).download();
  return buffer;
}

export async function bbPdfExists(path: string): Promise<boolean> {
  const [exists] = await getStorage().bucket().file(path).exists();
  return exists;
}
