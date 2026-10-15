import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Revisão das telas no tema escuro (issue #394), feita à máquina em vez de a
  olho: para cada elemento que declara fundo e texto na mesma lista de
  classes, o teste resolve os dois tokens em cada tema e cobra o contraste.

  É o que pega a combinação errada — `text-text-secondary` sobre
  `bg-danger-soft`, por exemplo — que os testes de token não veem, porque lá
  cada papel é conferido só contra a superfície comum.
*/
const APP = resolvePath('src/app');
const css = readFileSync(resolvePath('src/styles.css'), 'utf8');

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
const dark = declarations(bodyOf("[data-theme='dark']"));

/** Nomes de token de cor, os únicos `bg-`/`text-` que o teste considera. */
const TOKENS = Object.keys(semanticLayer)
  .map((name) => name.replace('--color-', ''))
  .filter((name) => !name.startsWith('chart-'));

function resolveToken(name: string, theme: Record<string, string>): string {
  let value: string | undefined = semanticLayer[`--color-${name}`];
  while (value) {
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    if (!reference) return value.toLowerCase();
    value = theme[reference[1]] ?? scales[reference[1]];
  }
  throw new Error(`token ${name} não resolve`);
}

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

function templateFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...templateFiles(full));
    } else if (/\.(html|ts)$/.test(entry) && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Separa a variante (`hover:`, `peer-checked:`…) do nome da utilitária. */
function splitVariant(token: string): { variant: string; name: string } {
  const parts = token.split(':');
  return {
    variant: parts.slice(0, -1).join(':'),
    name: parts[parts.length - 1].replace(/!$/, ''),
  };
}

interface Pair {
  origem: string;
  fundo: string;
  texto: string;
}

function pairsInMarkup(): Pair[] {
  const pairs: Pair[] = [];
  for (const file of templateFiles(APP)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/["'`]([^"'`]*?)["'`]/g)) {
      const fundos = new Map<string, string>();
      const textos = new Map<string, string>();
      for (const raw of match[1].split(/\s+/)) {
        const { variant, name } = splitVariant(raw);
        if (name.startsWith('bg-') && TOKENS.includes(name.slice(3))) {
          fundos.set(variant, name.slice(3));
        }
        if (name.startsWith('text-') && TOKENS.includes(name.slice(5))) {
          textos.set(variant, name.slice(5));
        }
      }
      for (const [variant, fundo] of fundos) {
        // O texto da mesma variante vence; sem ele, vale o texto de base —
        // é assim que o navegador resolve um `hover:bg-` sem `hover:text-`.
        const texto = textos.get(variant) ?? textos.get('');
        if (texto) {
          pairs.push({ origem: relative(APP, file), fundo, texto });
        }
      }
    }
  }
  return pairs;
}

const pairs = pairsInMarkup();

describe('contraste das telas nos dois temas', () => {
  it('encontra pares de fundo e texto na marcação', () => {
    expect(pairs.length).toBeGreaterThan(5);
  });

  it.each([
    ['claro', light],
    ['escuro', dark],
  ])('mantém texto legível sobre o fundo no tema %s', (_name, theme) => {
    const reprovados = pairs
      .map((pair) => ({
        ...pair,
        razao: contrast(
          resolveToken(pair.texto, theme),
          resolveToken(pair.fundo, theme),
        ),
      }))
      .filter((pair) => pair.razao < 4.5)
      .map(
        (pair) =>
          `${pair.origem}: text-${pair.texto} sobre bg-${pair.fundo} = ${pair.razao.toFixed(2)}:1`,
      );

    expect([...new Set(reprovados)]).toEqual([]);
  });
});

/*
  Os botões "Aplicar" da Sugestão do mês ficam sobre o painel `bg-brand-soft`,
  um fundo que não está na mesma lista de classes e que o teste acima não vê.
  A borda era da cor do painel e sumia nos dois temas (issue #543).
*/
describe('botões Aplicar da Sugestão do mês', () => {
  const PAINEL = 'brand-soft';
  const markup = readFileSync(
    join(
      APP,
      'features/recommended-wallet/components/ai-suggestion-panel/ai-suggestion-panel.component.html',
    ),
    'utf8',
  );
  const botoes = [
    ...markup.matchAll(
      /<button\s+type="button"\s+class="([^"]+)"\s+\[attr\.data-testid\]="\s*'apply-/g,
    ),
  ].map((match) => match[1].split(/\s+/));

  /** Token da utilitária `prefixo-` na variante pedida (`''` é a base). */
  function token(
    classes: string[],
    prefixo: string,
    variante: string,
  ): string | undefined {
    for (const raw of classes) {
      const { variant, name } = splitVariant(raw);
      if (variant === variante && name.startsWith(prefixo)) {
        const nome = name.slice(prefixo.length);
        if (TOKENS.includes(nome) || nome === 'transparent') return nome;
      }
    }
    return undefined;
  }

  /** Estado habilitado e desabilitado, com o fundo efetivo de cada um. */
  function estados(classes: string[]) {
    const base = {
      fundo: token(classes, 'bg-', '') ?? PAINEL,
      borda: token(classes, 'border-', ''),
      texto: token(classes, 'text-', ''),
    };
    const fundoDesabilitado = token(classes, 'bg-', 'disabled') ?? base.fundo;
    const desabilitado = {
      fundo: fundoDesabilitado === 'transparent' ? PAINEL : fundoDesabilitado,
      borda: token(classes, 'border-', 'disabled') ?? base.borda,
      texto: token(classes, 'text-', 'disabled') ?? base.texto,
    };
    return { habilitado: base, desabilitado };
  }

  it('encontra o botão do item e o da alternativa', () => {
    expect(botoes.length).toBe(2);
  });

  it.each([
    ['claro', light],
    ['escuro', dark],
  ])('mantém borda e texto legíveis no tema %s', (_name, theme) => {
    const reprovados: string[] = [];
    for (const classes of botoes) {
      for (const [estado, cores] of Object.entries(estados(classes))) {
        expect(cores.borda, `${estado} sem borda`).toBeDefined();
        expect(cores.texto, `${estado} sem texto`).toBeDefined();
        const borda = contrast(
          resolveToken(cores.borda!, theme),
          resolveToken(PAINEL, theme),
        );
        const texto = contrast(
          resolveToken(cores.texto!, theme),
          resolveToken(cores.fundo, theme),
        );
        if (borda < 3) {
          reprovados.push(
            `${estado}: border-${cores.borda} sobre bg-${PAINEL} = ${borda.toFixed(2)}:1`,
          );
        }
        if (texto < 4.5) {
          reprovados.push(
            `${estado}: text-${cores.texto} sobre bg-${cores.fundo} = ${texto.toFixed(2)}:1`,
          );
        }
      }
    }

    expect([...new Set(reprovados)]).toEqual([]);
  });

  it('distingue o "Aplicado" do habilitado pelo preenchimento, não só pela cor', () => {
    for (const classes of botoes) {
      const { habilitado, desabilitado } = estados(classes);
      expect(desabilitado.fundo).not.toBe(habilitado.fundo);
    }
  });
});
