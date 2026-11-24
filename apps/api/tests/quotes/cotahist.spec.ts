import { ProviderHttpError } from '../../src/quotes/provider-http-error';
import {
  fetchCotahistClosingPrices,
  parseCotahist,
} from '../../src/quotes/cotahist';
import { buildZip } from '../support/zip';

// Linhas reais do COTAHIST_D23112026 publicado pela B3 (registros de 245
// posições). O preço de último negócio (PREULT) vem em centavos, sem vírgula.
const HEADER = '00COTAHIST.2026BOVESPA 20261123'.padEnd(245, ' ');
const HGLG11 =
  '012026112312HGLG11      010FII HGLG PAXCI           R$  000000001418000000000141800000000013970000000001406200000000140690000000014055000000001406918092000000000000135647000000001907516666000000000000009999123100000010000000000000BRHGLGCTF004303';
const ITSA4 =
  '012026112302ITSA4       010ITAUSA      PN      N1   R$  000000000130200000000013130000000001287000000000129700000000012910000000001290000000000129223166000000000020674800000000026815469800000000000000009999123100000010000000000000BRITSAACNPR7460';
const TRAILER = '99COTAHIST.2026BOVESPA 2026112300000013033'.padEnd(245, ' ');

/** Mesma linha do HGLG11, no mercado fracionário (TPMERC 020). */
const HGLG11F = HGLG11.replace('HGLG11      010', 'HGLG11F     020');

function file(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

function zipResponse(text: string, status = 200) {
  const body = buildZip('COTAHIST_D23112026.TXT', Buffer.from(text, 'latin1'));
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: jest
      .fn()
      .mockResolvedValue(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      ),
  };
}

describe('parseCotahist', () => {
  it('deve ler o fechamento oficial em reais, o ISIN e o pregão de cada ticker', () => {
    const result = parseCotahist(file([HEADER, HGLG11, ITSA4, TRAILER]));

    expect(result.get('HGLG11')).toEqual({
      date: '2026-11-23',
      price: 140.69,
      isin: 'BRHGLGCTF004',
    });
    expect(result.get('ITSA4')).toEqual({
      date: '2026-11-23',
      price: 12.91,
      isin: 'BRITSAACNPR7',
    });
  });

  it('deve ignorar o cabeçalho e o rodapé do arquivo', () => {
    const result = parseCotahist(file([HEADER, TRAILER]));

    expect(result.size).toBe(0);
  });

  // O fracionário tem preço próprio; o catálogo usa o lote padrão.
  it('deve ignorar os negócios fora do mercado à vista (TPMERC 010)', () => {
    const result = parseCotahist(file([HGLG11F]));

    expect(result.size).toBe(0);
  });

  it('deve ignorar o ticker com último preço zero', () => {
    const zero = HGLG11.replace('0000000014069', '0000000000000');

    const result = parseCotahist(file([zero]));

    expect(result.size).toBe(0);
  });

  it('deve ignorar linha truncada', () => {
    const result = parseCotahist(file([HGLG11.slice(0, 120)]));

    expect(result.size).toBe(0);
  });
});

describe('fetchCotahistClosingPrices', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve baixar o arquivo diário do pregão pedido', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(zipResponse(file([HEADER, HGLG11, TRAILER])));
    globalThis.fetch = fetchMock;

    const result = await fetchCotahistClosingPrices('2026-11-23');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D23112026.ZIP',
    );
    expect(result?.get('HGLG11')?.price).toBe(140.69);
  });

  // Fim de semana, feriado ou atraso da B3: não há o que reconciliar.
  it('deve devolver undefined quando o arquivo do dia não existe (404)', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: jest.fn(),
    });

    await expect(
      fetchCotahistClosingPrices('2026-11-22'),
    ).resolves.toBeUndefined();
  });

  it('deve lançar ProviderHttpError nas demais falhas HTTP', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      arrayBuffer: jest.fn(),
    });

    await expect(
      fetchCotahistClosingPrices('2026-11-23'),
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it('deve descartar registros de outro pregão', async () => {
    const other = HGLG11.replace('0120261123', '0120261120');
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(zipResponse(file([HEADER, other, ITSA4, TRAILER])));

    const result = await fetchCotahistClosingPrices('2026-11-23');

    expect(result?.has('HGLG11')).toBe(false);
    expect(result?.has('ITSA4')).toBe(true);
  });

  it('deve devolver undefined quando o arquivo não traz nenhum negócio do pregão', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(zipResponse(file([HEADER, TRAILER])));

    await expect(
      fetchCotahistClosingPrices('2026-11-23'),
    ).resolves.toBeUndefined();
  });

  it('deve lançar erro quando o conteúdo não é um ZIP', async () => {
    const garbage = Buffer.from('<html>manutenção</html>');
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(garbage.buffer),
    });

    await expect(fetchCotahistClosingPrices('2026-11-23')).rejects.toThrow();
  });
});
