import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Fonte única das regras do projeto
//
// As regras já viveram em quatro arquivos que divergiam em silêncio (#325) e,
// depois, em um `CLAUDE.md` do qual os demais eram gerados. Agora existe um
// só: `AGENTS.md`. Estes testes impedem que uma cópia volte a nascer — cada
// arquivo a mais é uma verdade a mais para manter em dia.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const REMOVIDOS = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md'];

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

describe('fonte única das regras', () => {
  describe('AGENTS.md', () => {
    it('deve se declarar a fonte primária', () => {
      expect(conteudo('AGENTS.md')).toMatch(/fonte única/i);
    });

    it('não deve se apresentar como arquivo gerado', () => {
      expect(conteudo('AGENTS.md')).not.toMatch(/arquivo gerado/i);
      expect(conteudo('AGENTS.md')).not.toContain('docs:rules');
    });

    it('não deve apontar para `.devin/rules/`, que não existe', () => {
      expect(conteudo('AGENTS.md')).not.toContain('.devin');
    });

    it('deve manter a seção RTK', () => {
      expect(conteudo('AGENTS.md')).toContain('## RTK');
    });
  });

  it.each(REMOVIDOS)('%s não deve existir', (arquivo) => {
    expect(existsSync(join(repoRoot, arquivo))).toBe(false);
  });

  it('não deve restar gerador de guias', () => {
    const pkg = JSON.parse(conteudo('package.json'));

    expect(existsSync(join(repoRoot, 'scripts', 'sync-rules.mjs'))).toBe(false);
    expect(pkg.scripts['docs:rules']).toBeUndefined();
    expect(pkg.scripts['docs:rules:check']).toBeUndefined();
  });

  it('nenhum arquivo versionado deve citar `.devin`', () => {
    let saida = '';
    try {
      saida = execFileSync('git', ['grep', '-l', '--', '.devin'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      });
    } catch {
      // `git grep` sai com 1 quando não encontra nada — o caso esperado.
    }

    // Este arquivo nomeia o caminho proibido para poder procurá-lo.
    const encontrados = saida
      .split('\n')
      .filter(
        (linha) => linha && !linha.endsWith('guias-sincronizados.spec.ts'),
      );

    expect(encontrados).toEqual([]);
  });
});

describe('README do frontend', () => {
  it('não deve ser o boilerplate do Angular CLI', () => {
    expect(conteudo('apps/web/README.md')).not.toContain(
      'This project was generated using',
    );
  });
});
