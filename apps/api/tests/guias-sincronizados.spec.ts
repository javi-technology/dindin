import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Fonte única das regras do projeto (issue #325)
//
// As regras viviam em quatro arquivos mantidos sincronizados à mão, e as
// cópias divergiam em silêncio: a seção de deploy nasceu só no CLAUDE.md e no
// AGENTS.md, e o cabeçalho dos três apontava para `.devin/rules/`, que já não
// existe — ponteiro quebrado que chegou a derrubar a suíte (#365).
//
// Agora `CLAUDE.md` é a fonte e os demais são gerados por
// `npm run docs:rules`. Estes testes são o que impede a divergência de voltar:
// sem eles, a regra "gerado a partir do CLAUDE.md" seria só mais uma
// convenção escrita.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const GERADOS = ['AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md'];

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

describe('fonte única das regras', () => {
  describe('CLAUDE.md', () => {
    it('deve se declarar a fonte primária', () => {
      expect(conteudo('CLAUDE.md')).toContain('fonte primária');
    });

    it('não deve apontar para `.devin/rules/`, que não existe', () => {
      expect(conteudo('CLAUDE.md')).not.toContain('.devin');
    });
  });

  it('nenhum arquivo versionado deve citar `.devin`', () => {
    const encontrados = execFileSync(
      'git',
      ['grep', '-l', '--', '.devin'],
      { cwd: repoRoot, encoding: 'utf-8' },
      // `git grep` sai com 1 quando não encontra nada, e é esse o caso
      // esperado: o catch devolve string vazia.
    ).trim();

    expect(encontrados).toBe('');
  });

  describe.each(GERADOS)('%s', (arquivo) => {
    it('deve avisar que é gerado e apontar para a fonte', () => {
      expect(conteudo(arquivo)).toContain('npm run docs:rules');
      expect(conteudo(arquivo)).toContain('CLAUDE.md');
    });
  });

  it('deve estar em dia com a fonte', () => {
    // O próprio gerador confere: o que `--check` reprova é exatamente o que um
    // `npm run docs:rules` produziria de diferente.
    expect(() =>
      execFileSync('node', ['scripts/sync-rules.js', '--check'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      }),
    ).not.toThrow();
  });

  it('deve expor o gerador como script do npm', () => {
    const pkg = JSON.parse(conteudo('package.json'));

    expect(pkg.scripts['docs:rules']).toContain('scripts/sync-rules.js');
  });
});

describe('README do frontend', () => {
  it('não deve ser o boilerplate do Angular CLI', () => {
    expect(conteudo('apps/web/README.md')).not.toContain(
      'This project was generated using',
    );
  });
});
