import { PDFParse } from 'pdf-parse';
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

export function parseWalletTable(pageText: string): ParsedRow[] {
  // Os `\s*` entre as colunas absorvem a diferença de extração do pdf-parse 2
  // (issue #319): a v1 entregava `1,07%R$ 88,04` colado, a v2 entrega
  // `1,07% R$ 88,04`. O padrão aceita os dois.
  const regex =
    /^([A-Z]{4}11)([^\d%]+?)(-?\d+,\d{2}%)\s*R\$\s*([\d.]+,\d{2})\s*(\d+,\d{2}%)/gm;
  const rows: ParsedRow[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(pageText)) !== null) {
    rows.push({
      ticker: match[1],
      segment: match[2].trim(),
      ifixWeight: parsePercentage(match[3]),
      closePrice: parseBrazilianNumber(match[4]),
      weight: parsePercentage(match[5]),
    });
  }

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

  const rendaPage = pages.find(
    (text) =>
      text.includes('Carteira Renda') &&
      text.includes('Fundos Recomendados') &&
      !text.includes('Ganho de Capital'),
  );
  if (!rendaPage) {
    throw new Error(
      'Não foi encontrada a página da Carteira Renda / Fundos Recomendados',
    );
  }

  const ganhoPage = pages.find(
    (text) =>
      text.includes('Carteira Ganho de Capital') &&
      text.includes('Fundos Recomendados'),
  );
  if (!ganhoPage) {
    logWarn('parseBbFiiPdf.ganhoPageMissing');
  }

  return {
    publishedAt: publishedDateFromText(parsed.text) ?? today(),
    renda: parseWalletTable(rendaPage),
    ganho: ganhoPage ? parseWalletTable(ganhoPage) : [],
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
