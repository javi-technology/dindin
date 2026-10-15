import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Identidade do site na aba do navegador (issue #563)
//
// A aba mostrava o favicon padrão do Angular e o título "DindinWeb", herdados
// da geração do projeto: entre as abas abertas, nada dizia que era o DinDin.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');
const web = (arquivo: string): string => join(repoRoot, 'apps/web', arquivo);
const conteudo = (arquivo: string): string =>
  readFileSync(web(arquivo), 'utf-8');

describe('identidade do site na aba', () => {
  it('deve ter o título DinDin', () => {
    expect(conteudo('src/index.html')).toContain('<title>DinDin</title>');
  });

  it('deve referenciar o favicon em SVG', () => {
    expect(conteudo('src/index.html')).toMatch(
      /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg" \/>/,
    );
  });

  it('não deve manter o favicon padrão do Angular', () => {
    expect(existsSync(web('public/favicon.ico'))).toBe(false);
    expect(conteudo('src/index.html')).not.toContain('favicon.ico');
  });

  describe('favicon.svg', () => {
    const svg = (): string => conteudo('public/favicon.svg');

    // A cor vem do `@theme` da web: o favicon não pode divergir da paleta.
    it('deve usar a cor da marca da paleta', () => {
      const jade700 = /--color-jade-700:\s*(#[0-9a-f]{6})/i.exec(
        conteudo('src/styles.css'),
      )![1];

      expect(svg().toLowerCase()).toContain(`fill="${jade700.toLowerCase()}"`);
    });

    // Texto num SVG depende da fonte instalada no aparelho: o "D$" é
    // desenhado em traço, para sair igual em qualquer navegador.
    it('deve desenhar o D$ sem depender de fonte', () => {
      expect(svg()).toMatch(/viewBox="0 0 32 32"/);
      expect(svg()).not.toMatch(/<text/);
    });
  });
});
