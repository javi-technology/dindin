import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Guarda da paleta (issue #392). Enquanto existir utilitária de cor literal na
  marcação, cada tela nova pode escolher o próprio azul e a identidade vira
  decoração. O passo da escala (`bg-jade-700`) também não passa: ele fixa o tema
  claro na marcação e obrigaria a revisitar estes mesmos arquivos quando o modo
  escuro entrar. O que as telas usam é o token semântico por papel.
*/
const ROOT = resolvePath('src/app');

const TAILWIND_FAMILIES = [
  'slate',
  'gray',
  'zinc',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const PALETTE_SCALES = ['jade', 'creme', 'neutral'];

const PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'divide',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'placeholder',
  'accent',
  'decoration',
  'shadow',
  'caret',
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (
      /\.(html|ts)$/.test(entry) &&
      !entry.endsWith('palette-usage.spec.ts')
    ) {
      found.push(full);
    }
  }
  return found;
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        hits.push(`${relative(ROOT, file)}:${index + 1} ${match[0]}`);
      }
    });
  }
  return hits;
}

const prefixes = PREFIXES.join('|');

describe('uso da paleta nas telas', () => {
  it('não usa utilitária de cor literal do Tailwind', () => {
    const pattern = new RegExp(
      `\\b(?:${prefixes})-(?:${TAILWIND_FAMILIES.join('|')})-\\d{2,3}\\b`,
      'g',
    );
    expect(offenders(pattern)).toEqual([]);
  });

  it('não usa o passo da escala da paleta, só o token semântico', () => {
    const pattern = new RegExp(
      `\\b(?:${prefixes})-(?:${PALETTE_SCALES.join('|')})-\\d{2,3}\\b`,
      'g',
    );
    expect(offenders(pattern)).toEqual([]);
  });

  it('não usa preto, branco nem cor arbitrária na marcação', () => {
    const pattern =
      /\b(?:bg|text|border|ring|divide|fill|stroke|outline)-(?:black|white)\b/g;
    expect(offenders(pattern)).toEqual([]);
  });
});
