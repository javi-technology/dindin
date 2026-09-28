import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Paridade da paleta entre a web e o app (issue #401)
//
// A identidade visual é definida por tokens CSS no `@theme` do app web. O
// Flutter não lê CSS: sem esta conferência, o app reimplementaria as cores à
// mão e divergiria da web na primeira mudança de paleta — e a divergência não
// quebra compilação nem teste, só aparece em captura de tela lado a lado.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

const css = (): string => conteudo('apps/web/src/styles.css');
const dart = (): string =>
  conteudo('apps/mobile/lib/core/theme/dindin_colors.dart');

/** `--color-jade-500: #00bb77;` → `{ 'jade-500': '00bb77' }` */
const escalasDoCss = (): Record<string, string> => {
  const encontradas = css().matchAll(
    /--color-([a-z]+-(?:\d+|ink)):\s*#([0-9a-fA-F]{6});/g,
  );

  return Object.fromEntries(
    [...encontradas].map(([, nome, valor]) => [nome, valor.toLowerCase()]),
  );
};

/** `static const jade500 = Color(0xFF00BB77);` → `{ 'jade-500': '00bb77' }` */
const escalasDoDart = (): Record<string, string> => {
  const encontradas = dart().matchAll(
    /static const (\w+?)(\d+|Ink) = Color\(0xFF([0-9A-Fa-f]{6})\);/g,
  );

  return Object.fromEntries(
    [...encontradas].map(([, familia, passo, valor]) => [
      `${familia}-${passo === 'Ink' ? 'ink' : passo}`,
      valor.toLowerCase(),
    ]),
  );
};

/** Papéis do bloco `:root` ou do bloco do escuro, apontando para a escala. */
const papeisDoCss = (bloco: 'claro' | 'escuro'): Record<string, string> => {
  const fonte = css();
  const inicio =
    bloco === 'claro'
      ? fonte.indexOf('\n:root {')
      : fonte.indexOf("[data-theme='dark'] {");
  const trecho = fonte.slice(inicio, fonte.indexOf('}', inicio));

  const papeis: Record<string, string> = {};
  for (const [, papel, escala] of trecho.matchAll(
    /--dindin-([a-z0-9-]+):\s*var\(--color-([a-z]+-(?:\d+|ink))\);/g,
  )) {
    papeis[papel] = escala;
  }
  return papeis;
};

/** Papéis do mapa de tokens do app, na forma `action: jade-700`. */
const papeisDoDart = (bloco: 'claro' | 'escuro'): Record<string, string> => {
  const fonte = conteudo('apps/mobile/lib/core/theme/dindin_tokens.dart');
  const marcador = `// paridade-web:${bloco}`;
  const inicio = fonte.indexOf(marcador);
  const trecho = fonte.slice(inicio, fonte.indexOf('// fim-paridade', inicio));

  const papeis: Record<string, string> = {};
  for (const [, papel, escala] of trecho.matchAll(
    /(\w+):\s*DinDinColors\.(\w+?)(\d+|Ink)\b/g,
  )) {
    papeis[papel] = escala;
  }

  // O nome em Dart é camelCase (`surfaceElevated`); o do CSS, kebab
  // (`surface-elevated`).
  return Object.fromEntries(
    Object.entries(papeis).map(([papel, escala]) => [
      papel.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`),
      escala,
    ]),
  );
};

describe('paleta do app', () => {
  describe('escalas', () => {
    it('devem ter os mesmos valores da web', () => {
      const web = escalasDoCss();
      const app = escalasDoDart();

      // O app só precisa dos passos que usa; o que não pode é ter um passo
      // com valor diferente do da web.
      for (const [passo, valor] of Object.entries(app)) {
        expect(web[passo]).toBeDefined();
        expect({ passo, valor }).toEqual({ passo, valor: web[passo] });
      }
    });

    it('devem cobrir as cores da marca', () => {
      const app = escalasDoDart();

      expect(app['jade-500']).toBe('00bb77');
      expect(app['creme-50']).toBe('fdfbd4');
    });
  });

  describe.each(['claro', 'escuro'] as const)('tema %s', (bloco) => {
    it('deve apontar cada papel para o mesmo passo que a web', () => {
      const web = papeisDoCss(bloco);
      const app = papeisDoDart(bloco);

      expect(Object.keys(app).length).toBeGreaterThan(0);

      for (const [papel, escala] of Object.entries(app)) {
        if (web[papel] === undefined) continue;
        expect({ papel, escala }).toEqual({ papel, escala: web[papel] });
      }
    });
  });

  // A inversão é o ponto mais fácil de errar da paleta: `jade-700` contra a
  // superfície escura cai para 3,60:1 e o botão some.
  it('deve inverter a ação entre os temas, como a web', () => {
    expect(papeisDoDart('claro')['action']).toBe('jade-700');
    expect(papeisDoDart('escuro')['action']).toBe('jade-500');
  });
});
