import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  A paleta (issue #391) vive em `styles.css`, fora do alcance do TestBed: é CSS,
  não componente. Por isso o teste lê o arquivo e confere os tokens declarados,
  em vez de renderizar tela. É o que impede um valor de mudar sem intenção.
*/
const css = readFileSync(resolvePath('src/styles.css'), 'utf8');
const doc = readFileSync(resolvePath('../../docs/paleta.md'), 'utf8');

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
const semanticLayer = declarations(bodyOf('@theme inline'));
const light = declarations(bodyOf(':root'));
const dark = declarations(
  bodyOf(':root', bodyOf('@media (prefers-color-scheme: dark)')),
);

const roles = [
  'surface',
  'surface-elevated',
  'text-primary',
  'text-secondary',
  'action',
  'on-action',
  'accent',
  'border',
  'border-strong',
  'focus',
  'info',
  'warning',
  'danger',
  'positive',
];

function resolve(value: string): string {
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (!reference) return value;
  const target = scales[reference[1]];
  expect(target, `token ${reference[1]} não existe nas escalas`).toBeDefined();
  return resolve(target);
}

describe('paleta Verde-Jade e Creme', () => {
  it('declara a escala jade ancorada em #00bb77 no passo 500', () => {
    expect(scales).toMatchObject({
      '--color-jade-50': '#e4ffee',
      '--color-jade-100': '#cff9df',
      '--color-jade-300': '#7ddfaa',
      '--color-jade-400': '#4acf8f',
      '--color-jade-500': '#00bb77',
      '--color-jade-600': '#009f65',
      '--color-jade-700': '#008654',
      '--color-jade-900': '#005634',
    });
  });

  it('declara a escala creme ancorada em #fdfbd4 no passo 50', () => {
    expect(scales).toMatchObject({
      '--color-creme-50': '#fdfbd4',
      '--color-creme-300': '#e2dc8e',
      '--color-creme-600': '#948b05',
      '--color-creme-700': '#7b7301',
      '--color-creme-900': '#4f4a00',
    });
  });

  it('declara os neutros derivados do creme, com as superfícies escuras', () => {
    expect(scales).toMatchObject({
      '--color-neutral-50': '#fbfaf4',
      '--color-neutral-200': '#e7e7e1',
      '--color-neutral-400': '#ababa5',
      '--color-neutral-600': '#696964',
      '--color-neutral-800': '#3a3935',
      '--color-neutral-850': '#2c2c27',
      '--color-neutral-900': '#1f1e1a',
      '--color-neutral-950': '#141410',
      '--color-neutral-975': '#12120e',
    });
  });

  it('declara as semânticas com o passo do claro e o do escuro', () => {
    expect(scales).toMatchObject({
      '--color-info-600': '#0388a4',
      '--color-info-400': '#28bde0',
      '--color-warning-600': '#9f7100',
      '--color-warning-400': '#d7a035',
      '--color-danger-600': '#c04442',
      '--color-danger-400': '#f8837c',
      '--color-positive-700': '#167425',
      '--color-positive-400': '#70c174',
    });
  });

  it('expõe um token por papel, apontando para a variável do tema', () => {
    for (const role of roles) {
      expect(semanticLayer[`--color-${role}`], `papel ${role}`).toBe(
        `var(--dindin-${role})`,
      );
    }
  });

  it('define todo papel nos dois temas', () => {
    for (const role of roles) {
      expect(light[`--dindin-${role}`], `papel ${role} no claro`).toBeDefined();
      expect(dark[`--dindin-${role}`], `papel ${role} no escuro`).toBeDefined();
    }
  });

  it('inverte a ação primária entre os temas', () => {
    expect(resolve(light['--dindin-action'])).toBe('#008654');
    expect(resolve(light['--dindin-on-action'])).toBe('#ffffff');
    expect(resolve(dark['--dindin-action'])).toBe('#00bb77');
    expect(resolve(dark['--dindin-on-action'])).toBe('#0b2e22');
  });

  it('mantém valorização e desvalorização distintas da marca', () => {
    for (const theme of [light, dark]) {
      const brand = resolve(theme['--dindin-action']);
      expect(resolve(theme['--dindin-positive'])).not.toBe(brand);
      expect(resolve(theme['--dindin-danger'])).not.toBe(brand);
      expect(resolve(theme['--dindin-positive'])).not.toBe(
        resolve(theme['--dindin-danger']),
      );
    }
  });

  it('usa o creme como acento no escuro e o texto em neutro', () => {
    expect(resolve(dark['--dindin-accent'])).toBe('#fdfbd4');
    expect(resolve(dark['--dindin-text-primary'])).toBe('#e7e7e1');
    expect(resolve(dark['--dindin-text-secondary'])).toBe('#ababa5');
  });

  it('usa borda clara o bastante para a borda informativa do escuro', () => {
    expect(resolve(dark['--dindin-border-strong'])).toBe('#696964');
  });

  it('documenta cada papel da paleta', () => {
    for (const role of roles) {
      expect(doc, `papel ${role} sem documentação`).toContain(`\`${role}\``);
    }
  });
});
