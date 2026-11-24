import { inflateRawSync } from 'zlib';
import { ProviderHttpError } from './provider-http-error';

// Arquivo diário de cotações da B3, gratuito (#600). Traz o preço do leilão
// de fechamento, que é o oficial, e sai entre 20h30 e 21h20 do próprio dia.
const COTAHIST_URL = 'https://bvmf.bmfbovespa.com.br/InstDados/SerHist/';

/** Fechamento oficial de um ticker num pregão. */
export interface CotahistQuote {
  date: string; // YYYY-MM-DD
  price: number;
  isin: string;
}

// Layout de largura fixa da B3 (posições a partir de 0, fim exclusivo).
const QUOTE_RECORD = '01';
const SPOT_MARKET = '010'; // mercado à vista, lote padrão
const FIELD = {
  type: [0, 2],
  date: [2, 10],
  ticker: [12, 24],
  market: [24, 27],
  lastPrice: [108, 121], // PREULT, em centavos
  isin: [230, 242],
} as const;

function field(line: string, [start, end]: readonly [number, number]): string {
  return line.slice(start, end).trim();
}

/** Lê os registros de cotação do mercado à vista, indexados pelo ticker. */
export function parseCotahist(text: string): Map<string, CotahistQuote> {
  const quotes = new Map<string, CotahistQuote>();
  for (const line of text.split(/\r?\n/)) {
    // Registro de 245 posições; o ISIN é o último campo lido.
    if (line.length < FIELD.isin[1]) continue;
    if (field(line, FIELD.type) !== QUOTE_RECORD) continue;
    if (field(line, FIELD.market) !== SPOT_MARKET) continue;

    const cents = Number(field(line, FIELD.lastPrice));
    if (!Number.isInteger(cents) || cents <= 0) continue;

    const raw = field(line, FIELD.date);
    quotes.set(field(line, FIELD.ticker), {
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      price: cents / 100,
      isin: field(line, FIELD.isin),
    });
  }
  return quotes;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const DEFLATE = 8;
const STORED = 0;

/**
 * Conteúdo do primeiro arquivo de um ZIP. O COTAHIST tem um arquivo só, e
 * ler o diretório central evita uma dependência para um formato tão simples.
 */
export function unzipFirstFile(zip: Buffer): Buffer {
  let end = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Arquivo do COTAHIST não é um ZIP válido');

  const central = zip.readUInt32LE(end + 16);
  if (zip.readUInt32LE(central) !== CENTRAL_DIRECTORY_ENTRY) {
    throw new Error('Diretório do ZIP do COTAHIST inválido');
  }
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const localHeader = zip.readUInt32LE(central + 42);
  if (zip.readUInt32LE(localHeader) !== LOCAL_FILE_HEADER) {
    throw new Error('Cabeçalho do ZIP do COTAHIST inválido');
  }

  const start =
    localHeader +
    30 +
    zip.readUInt16LE(localHeader + 26) +
    zip.readUInt16LE(localHeader + 28);
  const data = zip.subarray(start, start + compressedSize);
  if (method === DEFLATE) return inflateRawSync(data);
  if (method === STORED) return data;
  throw new Error(`Compressão ${method} do COTAHIST não suportada`);
}

/**
 * Fechamentos oficiais do pregão `date` (YYYY-MM-DD).
 *
 * `undefined` quando a B3 não publicou o arquivo (fim de semana, feriado ou
 * atraso) ou quando ele não traz negócio do pregão pedido: não há o que
 * reconciliar, e isso não é falha.
 */
export async function fetchCotahistClosingPrices(
  date: string,
): Promise<Map<string, CotahistQuote> | undefined> {
  const [year, month, day] = date.split('-');
  const response = await fetch(
    `${COTAHIST_URL}COTAHIST_D${day}${month}${year}.ZIP`,
  );
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new ProviderHttpError(
      `COTAHIST da B3 respondeu com status ${response.status}`,
      response.status,
    );
  }

  const zip = Buffer.from(await response.arrayBuffer());
  const quotes = parseCotahist(unzipFirstFile(zip).toString('latin1'));
  for (const [ticker, quote] of quotes) {
    if (quote.date !== date) quotes.delete(ticker);
  }
  return quotes.size > 0 ? quotes : undefined;
}
