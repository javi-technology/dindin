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
      expect(conteudo('CLAUDE.md')).toMatch(/fonte primária/i);
    });

    it('não deve apontar para `.devin/rules/`, que não existe', () => {
      expect(conteudo('CLAUDE.md')).not.toContain('.devin');
    });
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

  describe.each(GERADOS)('%s', (arquivo) => {
    it('deve avisar que é gerado e apontar para a fonte', () => {
      expect(conteudo(arquivo)).toContain('npm run docs:rules');
      expect(conteudo(arquivo)).toContain('CLAUDE.md');
    });
  });

  // O rtk injeta e mantém o próprio bloco no guia do Copilot, em inglês. Copiar
  // também a seção RTK do CLAUDE.md deixaria a mesma instrução duas vezes no
  // arquivo, e o `--check` aceitaria a duplicação para sempre.
  describe('bloco do rtk no guia do Copilot', () => {
    const copilot = (): string => conteudo('.github/copilot-instructions.md');

    it('deve preservar o bloco injetado pelo rtk', () => {
      expect(copilot()).toContain('<!-- rtk-instructions');
    });

    it('não deve repetir a seção RTK vinda da fonte', () => {
      expect(copilot()).not.toContain('## RTK');
    });
  });

  it('deve manter a seção RTK nos guias sem bloco injetado', () => {
    for (const guia of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) {
      expect(conteudo(guia)).toContain('## RTK');
    }
  });

  it('deve estar em dia com a fonte', () => {
    // O próprio gerador confere: o que `--check` reprova é exatamente o que um
    // `npm run docs:rules` produziria de diferente.
    expect(() =>
      execFileSync('node', ['scripts/sync-rules.mjs', '--check'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      }),
    ).not.toThrow();
  });

  it('deve expor o gerador como script do npm', () => {
    const pkg = JSON.parse(conteudo('package.json'));

    expect(pkg.scripts['docs:rules']).toContain('scripts/sync-rules.mjs');
  });
});

describe('README do frontend', () => {
  it('não deve ser o boilerplate do Angular CLI', () => {
    expect(conteudo('apps/web/README.md')).not.toContain(
      'This project was generated using',
    );
  });
});
