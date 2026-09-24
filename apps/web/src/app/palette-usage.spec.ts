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

/*
  Utilitária de cor com valor arbitrário: `bg-[#ff0000]`, `text-[color:var(--x)]`
  ou `bg-[--token]`. Só conta como cor o que começa com notação de cor — a
  mesma sintaxe serve para tamanho e sombra, que não são assunto da paleta.
*/
function arbitraryColorPattern(): RegExp {
  return new RegExp(
    `\\b(?:${prefixes})-\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|lab\\(|lch\\(|color:|--)`,
    'g',
  );
}

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

  it('não usa preto nem branco na marcação', () => {
    const pattern =
      /\b(?:bg|text|border|ring|divide|fill|stroke|outline)-(?:black|white)\b/g;
    expect(offenders(pattern)).toEqual([]);
  });

  it('não usa cor arbitrária na marcação', () => {
    expect(offenders(arbitraryColorPattern())).toEqual([]);
  });
});

/*
  O detector de cor arbitraria precisa do proprio teste: varrer os arquivos so
  prova que hoje nao ha violacao, nao que o padrao reconheceria uma. E o
  recorte e estreito de proposito — `text-[13px]` e `shadow-[0_1px_2px]` usam a
  mesma sintaxe e nao tem nada a ver com cor.
*/
describe('detecção de cor arbitrária', () => {
  const casa = (classe: string): boolean =>
    arbitraryColorPattern().test(classe);

  it.each([
    'bg-[#ff0000]',
    'text-[#fff]',
    'border-[#123456]',
    'text-[color:var(--color-surface)]',
    'bg-[rgb(255,0,0)]',
    'bg-[rgba(255,0,0,0.5)]',
    'text-[hsl(120,50%,50%)]',
    'bg-[oklch(0.7_0.1_150)]',
    'bg-[--color-surface]',
  ])('deve reprovar %s', (classe) => {
    expect(casa(classe)).toBe(true);
  });

  it.each([
    'text-[13px]',
    'w-[2px]',
    'max-w-[40ch]',
    'shadow-[0_1px_2px]',
    'grid-cols-[1fr_auto]',
    'bg-surface',
  ])('não deve reprovar %s', (classe) => {
    expect(casa(classe)).toBe(false);
  });
});
