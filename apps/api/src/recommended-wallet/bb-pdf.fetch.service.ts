import { bbFileName } from './bb-pdf.parser';
import { todayDateInBrazil } from '../patrimony/patrimony-snapshot.service';

export async function fetchLatestBbPdf(
  month = todayDateInBrazil().slice(0, 7),
): Promise<{ fileName: string; buffer: Buffer; revision: number } | null> {
  let latest:
    { fileName: string; buffer: Buffer; revision: number } | undefined;
  for (let revision = 1; revision <= 5; revision += 1) {
    const fileName = bbFileName(month, revision);
    const response = await fetch(
      `https://www.bb.com.br/docs/portal/upb/${fileName}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          Accept: 'application/pdf',
        },
      },
    );
    if (response.status === 403) {
      if (!latest) {
        console.log('[fetchLatestBbPdf] bloqueado pelo BB (403)');
        return null;
      }
      break;
    }
    if (response.status === 404) {
      if (!latest) return null;
      break;
    }
    if (!response.ok) {
      if (latest) break;
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? '';
    if (
      contentType.includes('pdf') ||
      buffer.subarray(0, 4).toString() === '%PDF'
    ) {
      latest = { fileName, buffer, revision };
    }
  }
  return latest ?? null;
}
