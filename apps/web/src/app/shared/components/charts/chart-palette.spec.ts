import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHART_OTHER,
  CHART_NEGATIVE,
  CHART_POSITIVE,
  CHART_SERIES,
} from './chart-palette';

/*
  A série categórica dos gráficos (issue #393). Cor de gráfico não pode ser
  escolhida arquivo a arquivo: a série mora em `chart-palette.ts`, que aponta
  para tokens da paleta, e é aqui que se verifica que as séries continuam
  distinguíveis entre si.

  O critério é luminosidade, não matiz: quem imprime em tons de cinza ou tem
  baixa visão de cor só enxerga a diferença de claro para escuro.
*/
const CHARTS_DIR = resolvePath('src/app/shared/components/charts');
const css = readFileSync(resolvePath('src/styles.css'), 'utf8');

const MIN_SERIES_RATIO = 1.5;

function bodyOf(opening: string, source = css): string {
  const start = source.indexOf(opening);
  expect(start, `bloco "${opening}" não encontrado`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`bloco "${opening}" não foi fechado`);
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]] = match[2].trim().toLowerCase();
  }
  return out;
}

const scales = declarations(bodyOf('@theme {'));
const light = declarations(bodyOf(':root'));
const dark = declarations(
  bodyOf(':root', bodyOf('@media (prefers-color-scheme: dark)')),
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Resolve `var(--color-chart-1)` até o hexadecimal do tema informado. */
function resolveToken(token: string, theme: Record<string, string>): string {
  const reference = token.match(/^var\((--[\w-]+)\)$/);
  if (!reference) return token.toLowerCase();
  const next =
    theme[reference[1]] ?? scales[reference[1]] ?? light[reference[1]];
  expect(next, `token ${reference[1]} não existe`).toBeDefined();
  return resolveToken(next, theme);
}

const themes: [string, Record<string, string>][] = [
  ['claro', light],
  ['escuro', dark],
];

function chartFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...chartFiles(full));
    } else if (/\.(html|ts)$/.test(entry) && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('série categórica dos gráficos', () => {
  it('tem o jade como primeira série', () => {
    for (const [, theme] of themes) {
      expect(resolveToken(CHART_SERIES[0], theme)).toBe(
        resolveToken('var(--color-action)', theme),
      );
    }
  });

  it('usa os mesmos tokens das tabelas para alta e baixa', () => {
    expect(CHART_POSITIVE).toBe('var(--color-positive)');
    expect(CHART_NEGATIVE).toBe('var(--color-danger)');
  });

  it.each(themes)(
    'mantém séries vizinhas distinguíveis por luminosidade no tema %s',
    (_name, theme) => {
      const series = [...CHART_SERIES, CHART_OTHER].map((token) =>
        resolveToken(token, theme),
      );
      series.forEach((color, index) => {
        if (index === 0) return;
        expect(
          contrast(series[index - 1], color),
          `séries ${index} e ${index + 1}`,
        ).toBeGreaterThanOrEqual(MIN_SERIES_RATIO);
      });
    },
  );

  it.each(themes)(
    'mantém toda série visível sobre a superfície no tema %s',
    (_name, theme) => {
      const surface = resolveToken('var(--color-surface-elevated)', theme);
      for (const token of [...CHART_SERIES, CHART_OTHER]) {
        expect(
          contrast(resolveToken(token, theme), surface),
          `série ${token}`,
        ).toBeGreaterThanOrEqual(MIN_SERIES_RATIO);
      }
    },
  );

  it('não repete cor entre as séries', () => {
    for (const [, theme] of themes) {
      const series = [...CHART_SERIES, CHART_OTHER].map((token) =>
        resolveToken(token, theme),
      );
      expect(new Set(series).size).toBe(series.length);
    }
  });

  it('não deixa hexadecimal fora da definição central', () => {
    const offenders: string[] = [];
    for (const file of chartFiles(CHARTS_DIR)) {
      if (file.endsWith('chart-palette.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          offenders.push(
            `${relative(CHARTS_DIR, file)}:${index + 1} ${match[0]}`,
          );
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
