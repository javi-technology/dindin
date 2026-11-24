import { AssetType } from 'dindin-models';
import { ActiveAsset } from '../assets/asset.service';
import { logError, logWarn } from '../shared/logger';
import { DividendEvent, DividendProvider } from './dividend-provider';
import { isBlockingError, ProviderHttpError } from './provider-http-error';

// Endpoints públicos, mas sem documentação, do site da B3 Listados (#599). O
// parâmetro vai em JSON codificado em base64 no caminho.
const B3_FUNDS_URL =
  'https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/';
const B3_COMPANIES_URL =
  'https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/';
const PROVIDER = 'b3';

// Uma requisição por emissor; algumas em paralelo, para o job caber no tempo
// sem disparar limite de taxa.
const CONCURRENCY = 5;

type IssuerKind = 'fund' | 'company';

interface B3CashDividend {
  isinCode?: unknown;
  paymentDate?: unknown;
  lastDatePrior?: unknown;
  rate?: unknown;
  label?: unknown;
}

interface Issuer {
  kind: IssuerKind;
  code: string;
  tickers: string[];
}

function issuerKind(assetType: AssetType): IssuerKind | undefined {
  if (assetType === 'FII' || assetType === 'REIT') return 'fund';
  if (assetType === 'STOCK' || assetType === 'OTHER') return 'company';
  // ETFs ficam de fora, como já ficavam com a Brapi.
  return undefined;
}

/** O código do emissor são as quatro letras iniciais do ticker. */
function issuerCode(ticker: string): string {
  return ticker.slice(0, 4).toUpperCase();
}

// Tipo e classe do ISIN (posições 7 a 11) por sufixo do ticker de ação:
// ACN = ação, OR = ordinária, PR/PA/PB... = preferenciais; CDA = certificado
// de depósito, que é a UNIT (11); BDR = certificado de ação estrangeira
// (31 a 35), que a B3 lista no endpoint de empresas.
const STOCK_ISIN_CLASS: Record<string, string> = {
  '3': 'ACNOR',
  '4': 'ACNPR',
  '5': 'ACNPA',
  '6': 'ACNPB',
  '7': 'ACNPC',
  '8': 'ACNPD',
  '11': 'CDA',
  '31': 'BDR',
  '32': 'BDR',
  '33': 'BDR',
  '34': 'BDR',
  '35': 'BDR',
};

/**
 * Se o ISIN do evento é o do ticker pedido. A B3 lista, para o mesmo emissor,
 * as classes de ação e os recibos de subscrição dos FIIs, cada um com seus
 * próprios proventos.
 */
function matchesTicker(
  isin: string,
  ticker: string,
  kind: IssuerKind,
): boolean {
  if (isin.slice(2, 6) !== issuerCode(ticker)) return false;
  const typeAndClass = isin.slice(6, 11);
  // Cota do fundo; os recibos de subscrição têm `R..M..` no lugar de `CTF`.
  if (kind === 'fund') return typeAndClass.startsWith('CTF');
  const expected = STOCK_ISIN_CLASS[ticker.slice(4)];
  return expected !== undefined && typeAndClass.startsWith(expected);
}

/** `1.234,56` → 1234.56; `undefined` para o que não for número. */
function parseRate(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const rate = Number(value.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(rate) ? rate : undefined;
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`; `undefined` para data inválida ou vazia. */
function parseDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  // 31/02 vira 03/03 no Date: a volta para texto denuncia a data inexistente.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso)
    ? iso
    : undefined;
}

function requestUrl(issuer: Issuer): string {
  const params =
    issuer.kind === 'fund'
      ? { cnpj: '0', identifierFund: issuer.code, typeFund: 7 }
      : { issuingCompany: issuer.code, language: 'pt-br' };
  const encoded = Buffer.from(JSON.stringify(params)).toString('base64');
  const base = issuer.kind === 'fund' ? B3_FUNDS_URL : B3_COMPANIES_URL;
  return `${base}${encodeURIComponent(encoded)}`;
}

/**
 * A B3 devolve o corpo como texto JSON de um JSON (codificado duas vezes)
 * quando a requisição pede `application/json`. Texto que não é JSON segue
 * como está e cai no aviso de formato inesperado.
 */
function decodeBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

/** Lista de proventos da resposta; `undefined` se o formato mudou. */
function cashDividendsOf(
  data: unknown,
  kind: IssuerKind,
): B3CashDividend[] | undefined {
  // Empresas vêm numa lista de um item; fundos, num objeto.
  const body = kind === 'company' && Array.isArray(data) ? data[0] : data;
  const list =
    body && typeof body === 'object'
      ? (body as { cashDividends?: unknown }).cashDividends
      : undefined;
  return Array.isArray(list) ? (list as B3CashDividend[]) : undefined;
}

function eventsForTicker(
  dividends: B3CashDividend[],
  ticker: string,
  kind: IssuerKind,
): DividendEvent[] {
  const seen = new Set<string>();
  const events: DividendEvent[] = [];
  for (const dividend of dividends) {
    if (typeof dividend.isinCode !== 'string') continue;
    if (!matchesTicker(dividend.isinCode, ticker, kind)) continue;
    // Nos FIIs, amortização devolve capital e não é rendimento.
    if (kind === 'fund' && dividend.label !== 'RENDIMENTO') continue;
    const rate = parseRate(dividend.rate);
    if (rate === undefined) continue;

    const paymentDate = parseDate(dividend.paymentDate);
    const comDate = parseDate(dividend.lastDatePrior);
    const key = `${String(dividend.label)}|${paymentDate}|${comDate}|${rate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      rate,
      ...(paymentDate && { paymentDate }),
      ...(comDate && { comDate }),
    });
  }
  return events;
}

async function fetchIssuer(
  issuer: Issuer,
): Promise<Map<string, DividendEvent[]>> {
  const response = await fetch(requestUrl(issuer), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ProviderHttpError(
      `B3 Listados respondeu com status ${response.status}`,
      response.status,
    );
  }

  const dividends = cashDividendsOf(
    decodeBody(await response.json()),
    issuer.kind,
  );
  const result = new Map<string, DividendEvent[]>();
  if (!dividends) {
    logWarn('dividends.provider.unexpectedShape', {
      provider: PROVIDER,
      issuer: issuer.code,
    });
    return result;
  }

  for (const ticker of issuer.tickers) {
    const events = eventsForTicker(dividends, ticker, issuer.kind);
    if (events.length > 0) result.set(ticker, events);
  }
  return result;
}

function groupByIssuer(assets: ActiveAsset[]): Issuer[] {
  const issuers = new Map<string, Issuer>();
  for (const { ticker, assetType } of assets) {
    const kind = issuerKind(assetType);
    if (!kind) continue;
    const code = issuerCode(ticker);
    const key = `${kind}:${code}`;
    const issuer = issuers.get(key) ?? { kind, code, tickers: [] };
    issuer.tickers.push(ticker.toUpperCase());
    issuers.set(key, issuer);
  }
  return [...issuers.values()];
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Proventos em dinheiro dos ativos na B3 Listados, uma consulta por emissor.
 *
 * Falha de um emissor é logada e não impede os demais. Bloqueio (401, 403,
 * 429) interrompe as consultas. Lança apenas quando nenhum emissor respondeu.
 */
export async function fetchB3DividendEvents(
  assets: ActiveAsset[],
): Promise<Map<string, DividendEvent[]>> {
  const issuers = groupByIssuer(assets);
  const result = new Map<string, DividendEvent[]>();
  let answered = 0;
  let lastError: Error | undefined;

  for (let i = 0; i < issuers.length; i += CONCURRENCY) {
    const batch = issuers.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(fetchIssuer));

    let blocked = false;
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        answered += 1;
        for (const [ticker, events] of outcome.value)
          result.set(ticker, events);
        return;
      }
      lastError = toError(outcome.reason);
      blocked ||= isBlockingError(outcome.reason);
      logError('dividends.provider.issuerFailed', {
        provider: PROVIDER,
        issuer: batch[index].code,
        status:
          outcome.reason instanceof ProviderHttpError
            ? outcome.reason.status
            : undefined,
        message: lastError.message,
      });
    });

    if (blocked) break;
  }

  if (lastError && answered === 0) throw lastError;
  return result;
}

export const b3DividendProvider: DividendProvider = {
  name: PROVIDER,
  fetchDividendEvents: fetchB3DividendEvents,
};
