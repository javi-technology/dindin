import { PDFParse } from 'pdf-parse';
import type {
  RecommendedWalletChange,
  RecommendedWalletChanges,
} from 'dindin-models';
import { today } from '../shared/date';
import { logWarn } from '../shared/logger';

export interface ParsedRow {
  ticker: string;
  segment: string;
  ifixWeight: number;
  closePrice: number;
  weight: number;
}

const MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const MONTH_BY_NAME = new Map(
  MONTHS.map((month, index) => [month.toLowerCase(), index + 1]),
);

function parseBrazilianNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function parsePercentage(value: string): number {
  return Number(
    (parseBrazilianNumber(value.replace('%', '')) / 100).toFixed(4),
  );
}

function parseRowsTickerFirst(pageText: string): ParsedRow[] {
  // Os `\s*` entre as colunas absorvem a diferença de extração do pdf-parse 2
  // (issue #319): a v1 entregava `1,07%R$ 88,04` colado, a v2 entrega
  // `1,07% R$ 88,04`. O padrão aceita os dois.
  const regex =
    /^([A-Z]{4}11)([^\d%]+?)(-?\d+,\d{2}%)\s*R\$\s*([\d.]+,\d{2})\s*(\d+,\d{2}%)/gm;
  return [...pageText.matchAll(regex)].map((match) => ({
    ticker: match[1],
    segment: match[2].trim(),
    ifixWeight: parsePercentage(match[3]),
    closePrice: parseBrazilianNumber(match[4]),
    weight: parsePercentage(match[5]),
  }));
}

/**
 * Layout adotado pelo BB em novembro/2026 (issue #584): a linha começa pelo
 * peso, e o volume médio diário entra entre o IFIX e a cota.
 */
function parseRowsWeightFirst(pageText: string): ParsedRow[] {
  const regex =
    /^(\d+,\d{2}%)\s*([A-Z]{4}11)\s*([^\d%]+?)\s*(-?\d+,\d{2}%)\s*[\d.,]+\s*R\$\s*([\d.]+,\d{2})/gm;
  return [...pageText.matchAll(regex)].map((match) => ({
    ticker: match[2],
    segment: match[3].trim(),
    ifixWeight: parsePercentage(match[4]),
    closePrice: parseBrazilianNumber(match[5]),
    weight: parsePercentage(match[1]),
  }));
}

export function parseWalletTable(pageText: string): ParsedRow[] {
  const tickerFirstRows = parseRowsTickerFirst(pageText);
  const rows =
    tickerFirstRows.length > 0
      ? tickerFirstRows
      : parseRowsWeightFirst(pageText);

  if (rows.length < 4 || rows.length > 15) {
    throw new Error(
      `A tabela de fundos recomendados deve conter entre 4 e 15 linhas (encontradas: ${rows.length})`,
    );
  }

  const tickers = new Set<string>();
  for (const row of rows) {
    if (tickers.has(row.ticker)) {
      throw new Error(`A tabela contém ticker duplicado: ${row.ticker}`);
    }
    tickers.add(row.ticker);
  }

  const weightSum = rows.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(weightSum - 1) > 0.005) {
    throw new Error(
      `A soma dos pesos da tabela deve ser 1 (encontrado: ${weightSum.toFixed(4)})`,
    );
  }

  return rows;
}

type ChangeMarker = 'Sai' | 'Entra';
type ChangeBlock = Partial<Record<ChangeMarker, string[]>>;

/** O fundo pode continuar na linha seguinte: `Sai: RZAT11 (logístico) e PSEC11`. */
const CHANGE_CONTINUATION = /^(\(|e\s|[A-Z]{4}11\b)/;
const COMPOSITION_PAGE = /^Carteira Renda - /m;

function tickersIn(line: string): string[] {
  return line.match(/[A-Z]{4}11/g) ?? [];
}

/**
 * Lê os blocos da página de composição, que vêm em pares de "Sai:" e "Entra:".
 * A ordem do par varia entre os relatórios: setembro/2026 traz "Entra" antes.
 */
function readChangeBlocks(lines: string[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let current: ChangeBlock = {};

  lines.forEach((line, index) => {
    const marker = line.match(/^(Sai|Entra):/)?.[1] as ChangeMarker | undefined;
    if (!marker) return;
    if (current[marker]) {
      blocks.push(current);
      current = {};
    }
    const next = lines[index + 1] ?? '';
    current[marker] = [
      ...tickersIn(line),
      ...(CHANGE_CONTINUATION.test(next) ? tickersIn(next) : []),
    ];
  });
  if (current.Sai || current.Entra) blocks.push(current);
  return blocks;
}

/**
 * Entradas e saídas do mês (issue #586).
 *
 * O nome da carteira não vem junto do bloco, e o texto extraído de
 * novembro/2026 traz Ganho antes de Renda, então a carteira sai da tabela em
 * que o fundo que entra está. A informação é complementar: bloco que não confere
 * é descartado com aviso, sem impedir a importação das tabelas.
 */
export function parseWalletChanges(
  pages: string[],
  rendaTickers: string[],
  ganhoTickers: string[],
): RecommendedWalletChanges | undefined {
  const lines = pages
    .filter((page) => COMPOSITION_PAGE.test(page))
    .flatMap((page) => page.split('\n').map((line) => line.trim()));
  const blocks = readChangeBlocks(lines);

  if (blocks.some((block) => !block.Sai || !block.Entra)) {
    logWarn('parseWalletChanges.unpairedBlocks', { blocks: blocks.length });
    return undefined;
  }

  const tables = {
    renda: rendaTickers,
    ganho: ganhoTickers,
  };
  const changes: RecommendedWalletChanges = {};
  let discarded = false;

  for (const block of blocks) {
    const change: RecommendedWalletChange = {
      entering: block.Entra ?? [],
      leaving: block.Sai ?? [],
    };
    const wallet = (['renda', 'ganho'] as const).find(
      (name) =>
        !changes[name] &&
        change.entering.length > 0 &&
        change.leaving.length > 0 &&
        change.entering.every((ticker) => tables[name].includes(ticker)) &&
        !change.leaving.some((ticker) => tables[name].includes(ticker)),
    );
    if (wallet) {
      changes[wallet] = change;
    } else {
      discarded = true;
      logWarn('parseWalletChanges.blockDiscarded', { ...change });
    }
  }

  // "Sem alterações" também não diz a carteira: só vale quando sobra exatamente
  // o número de carteiras sem bloco.
  const withoutBlock = (['renda', 'ganho'] as const).filter(
    (name) => tables[name].length > 0 && !changes[name],
  );
  const unchanged = lines.filter((line) => line === 'Sem alterações').length;
  if (!discarded && unchanged > 0 && unchanged === withoutBlock.length) {
    for (const name of withoutBlock) {
      changes[name] = { entering: [], leaving: [] };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

function publishedDateFromText(text: string): string | null {
  const match = text.match(
    /(\d{1,2}) de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})/i,
  );
  if (!match) return null;

  const month = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ].indexOf(match[2].toLowerCase());
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${String(
    Number(match[1]),
  ).padStart(2, '0')}`;
}

export async function parseBbFiiPdf(buffer: Buffer): Promise<{
  publishedAt: string;
  renda: ParsedRow[];
  ganho: ParsedRow[];
  changes?: RecommendedWalletChanges;
}> {
  /**
   * O pdf-parse 2 já quebra linha por coordenada e separa colunas (issue
   * #319); na v1 isso era feito à mão num `pagerender`. Os limiares abaixo
   * reproduzem aquele comportamento: `lineThreshold: 0` quebra a qualquer
   * mudança de Y, como o `lastY !== y` de antes, e `cellSeparator: ''`
   * mantém os itens da mesma linha concatenados sem separador — é assim que
   * `parseWalletTable` espera as linhas da tabela.
   */
  const parser = new PDFParse({ data: buffer });
  let parsed;
  try {
    parsed = await parser.getText({
      lineEnforce: true,
      lineThreshold: 0,
      cellSeparator: '',
    });
  } finally {
    await parser.destroy();
  }
  const pages = parsed.pages.map((page) => page.text);

  const tablePages = pages.filter((text) =>
    text.includes('Fundos Recomendados'),
  );
  // O PDF de novembro/2026 traz a página de Ganho com o título "Carteira Renda"
  // (issue #584). Sem o título certo, vale a ordem do relatório: Renda, depois
  // Ganho. Um parser só pelo título gravaria a carteira sem o Ganho.
  const ganhoPage =
    tablePages.find((text) => text.includes('Carteira Ganho de Capital')) ??
    tablePages[1];
  const rendaPage = tablePages.find(
    (text) => text.includes('Carteira Renda') && text !== ganhoPage,
  );
  if (!rendaPage) {
    throw new Error(
      'Não foi encontrada a página da Carteira Renda / Fundos Recomendados',
    );
  }

  if (!ganhoPage) {
    logWarn('parseBbFiiPdf.ganhoPageMissing');
  }

  const renda = parseWalletTable(rendaPage);
  const ganho = ganhoPage ? parseWalletTable(ganhoPage) : [];
  const changes = parseWalletChanges(
    pages,
    renda.map((row) => row.ticker),
    ganho.map((row) => row.ticker),
  );

  return {
    publishedAt: publishedDateFromText(parsed.text) ?? today(),
    renda,
    ganho,
    ...(changes ? { changes } : {}),
  };
}

export function parseBbFileName(
  name: string,
): { month: string; revision: number } | null {
  const match = name.match(
    /^CartFII_(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)(\d{2})(?:_(\d+))?\.pdf$/i,
  );
  if (!match) return null;

  const revision = match[3] ? Number(match[3]) : 1;
  if (revision < 1) return null;
  const month = MONTH_BY_NAME.get(match[1].toLowerCase());
  if (!month) return null;
  return {
    month: `20${match[2]}-${String(month).padStart(2, '0')}`,
    revision,
  };
}

export function bbFileName(month: string, revision = 1): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Mês inválido: ${month}`);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12 || revision < 1) {
    throw new Error(`Mês ou revisão inválidos: ${month}`);
  }
  const suffix = revision === 1 ? '' : `_${revision}`;
  return `CartFII_${MONTHS[monthNumber - 1]}${match[1].slice(2)}${suffix}.pdf`;
}
