import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Desenvolvimento a partir da main (issue #568)
//
// A develop juntava as mudanças antes de um PR `develop → main`. Saiu do
// fluxo: as branches `issue-<N>` partem da main e voltam para ela, e cada
// merge é publicado. Uma menção esquecida à develop — no gatilho do CI, nas
// diretrizes ou num comando da documentação — faria alguém abrir branch ou PR
// contra uma branch que não existe mais.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');
const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

describe('fluxo de branches a partir da main', () => {
  describe('.github/workflows/ci-cd.yml', () => {
    /** Branches de um gatilho (`push` ou `pull_request`). */
    const branchesDe = (gatilho: string): string[] => {
      const bloco = new RegExp(
        `^  ${gatilho}:\\n    branches:\\n((?:      - .*\\n)+)`,
        'm',
      ).exec(conteudo('.github/workflows/ci-cd.yml'));
      return (bloco?.[1] ?? '')
        .split('\n')
        .map((linha) => linha.replace(/^\s*- /, '').trim())
        .filter(Boolean);
    };

    it.each(['push', 'pull_request'])(
      'deve disparar %s só na main',
      (gatilho) => {
        expect(branchesDe(gatilho)).toEqual(['main']);
      },
    );
  });

  it.each([
    'AGENTS.md',
    'README.md',
    'docs/compatibilidade-app-api.md',
    '.github/dependabot.yml',
    '.github/workflows/ci-cd.yml',
  ])('%s não deve citar a develop', (arquivo) => {
    expect(conteudo(arquivo)).not.toMatch(/\bdevelop\b/);
  });

  it('deve preparar a branch da issue a partir da main atualizada', () => {
    const guia = conteudo('AGENTS.md');
    const preparacao = guia.slice(
      guia.indexOf('### Preparação de Branch'),
      guia.indexOf('### Regras de Branch'),
    );

    expect(preparacao).toContain(
      'git checkout main && git pull origin main\ngit checkout -b issue-<numero_issue>',
    );
  });
});
