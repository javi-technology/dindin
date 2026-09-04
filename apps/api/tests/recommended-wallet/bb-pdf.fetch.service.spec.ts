import { fetchLatestBbPdf } from '../../src/recommended-wallet/bb-pdf.fetch.service';

function response(
  status: number,
  body = '%PDF-test',
  contentType = 'application/pdf',
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => Buffer.from(body),
  } as Response;
}

describe('bb-pdf.fetch.service', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('deve escolher a maior revisão disponível até o primeiro 404', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, '%PDF-1'))
      .mockResolvedValueOnce(response(200, '%PDF-2'))
      .mockResolvedValueOnce(response(404));

    await expect(fetchLatestBbPdf('2026-09')).resolves.toMatchObject({
      fileName: 'CartFII_Set26_2.pdf',
      revision: 2,
      buffer: Buffer.from('%PDF-2'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deve retornar nulo quando o BB bloqueia a primeira requisição', async () => {
    fetchMock.mockResolvedValueOnce(response(403));
    await expect(fetchLatestBbPdf('2026-09')).resolves.toBeNull();
  });

  it('deve retornar nulo quando ainda não há o PDF do mês', async () => {
    fetchMock.mockResolvedValueOnce(response(404));
    await expect(fetchLatestBbPdf('2026-09')).resolves.toBeNull();
  });
});
