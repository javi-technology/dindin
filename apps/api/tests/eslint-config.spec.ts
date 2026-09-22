import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes da configuração do ESLint (issue #220)
// Até esta issue o monorepo só tinha Prettier (formatação), sem nenhuma
// análise estática. Estes testes garantem que o ESLint existe, é exposto por
// script em cada workspace e bloqueia o deploy no CI. Não há hook de
// pre-commit (issue #235): o CI é a barreira.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

function readJson(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, ...segments), 'utf-8'));
}

function scripts(...segments: string[]): Record<string, string> {
  const pkg = readJson(...segments);
  return (pkg.scripts ?? {}) as Record<string, string>;
}

function devDependencies(...segments: string[]): Record<string, string> {
  const pkg = readJson(...segments);
  return (pkg.devDependencies ?? {}) as Record<string, string>;
}

describe('configuração do ESLint', () => {
  describe('flat config', () => {
    it('deve ter eslint.config.mjs na raiz do monorepo', () => {
      expect(existsSync(join(repoRoot, 'eslint.config.mjs'))).toBe(true);
    });

    it('deve ter eslint.config.mjs no workspace web', () => {
      expect(
        existsSync(join(repoRoot, 'apps', 'web', 'eslint.config.mjs')),
      ).toBe(true);
    });

    it('deve usar typescript-eslint na config da raiz', () => {
      const config = readFileSync(join(repoRoot, 'eslint.config.mjs'), 'utf-8');

      expect(config).toContain('typescript-eslint');
    });

    it('deve usar angular-eslint na config do web, com regras de template', () => {
      const config = readFileSync(
        join(repoRoot, 'apps', 'web', 'eslint.config.mjs'),
        'utf-8',
      );

      expect(config).toContain('angular-eslint');
      expect(config).toMatch(/\.html/);
    });
  });

  describe('dependências', () => {
    it('deve declarar eslint e typescript-eslint na raiz', () => {
      const deps = devDependencies('package.json');

      expect(deps).toHaveProperty('eslint');
      expect(deps).toHaveProperty('typescript-eslint');
    });

    it('deve declarar angular-eslint no workspace web', () => {
      const deps = devDependencies('apps', 'web', 'package.json');

      expect(deps).toHaveProperty('angular-eslint');
    });
  });

  describe('scripts', () => {
    it('deve expor script lint na raiz', () => {
      expect(scripts('package.json').lint).toBeDefined();
    });

    it('deve expor script lint na api e no web', () => {
      expect(scripts('apps', 'api', 'package.json').lint).toBeDefined();
      expect(scripts('apps', 'web', 'package.json').lint).toBeDefined();
    });
  });

  // O .husky/pre-commit foi removido em 33dd6f9, mas o script prepare seguia
  // recriando .husky/_ e apontando core.hooksPath para ele a cada install, e
  // a documentação afirmava que o hook rodava Prettier e ESLint (issue #235).
  describe('sem hook de pre-commit', () => {
    it('não deve instalar o husky no prepare', () => {
      expect(scripts('package.json').prepare ?? '').not.toContain('husky');
    });

    it('não deve depender de husky nem de lint-staged', () => {
      const deps = devDependencies('package.json');

      expect(deps).not.toHaveProperty('husky');
      expect(deps).not.toHaveProperty('lint-staged');
    });

    it('não deve ter configuração do lint-staged', () => {
      expect(readJson('package.json')['lint-staged']).toBeUndefined();
      expect(existsSync(join(repoRoot, 'lint-staged.config.cjs'))).toBe(false);
    });

    it('não deve versionar nada em .husky', () => {
      const tracked = execSync('git ls-files .husky', {
        cwd: repoRoot,
        encoding: 'utf-8',
      });

      expect(tracked.trim()).toBe('');
    });

    it('não deve agrupar husky nem lint-staged no Dependabot', () => {
      const dependabot = readFileSync(
        join(repoRoot, '.github', 'dependabot.yml'),
        'utf-8',
      );

      expect(dependabot).not.toMatch(/husky|lint-staged/);
    });

    it.each(['CLAUDE.md', '.github/copilot-instructions.md', 'GEMINI.md'])(
      'não deve documentar hook de pre-commit em %s',
      (file) => {
        const content = readFileSync(join(repoRoot, file), 'utf-8');

        expect(content).not.toMatch(/husky|lint-staged/i);
      },
    );
  });

  describe('CI', () => {
    const workflow = readFileSync(
      join(repoRoot, '.github', 'workflows', 'ci-cd.yml'),
      'utf-8',
    );

    /** Bloco de um job: da sua chave até a próxima chave de job (2 espaços). */
    function jobBlock(name: string): string {
      const match = new RegExp(
        `^  ${name}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`,
        'm',
      ).exec(workflow);
      return match?.[1] ?? '';
    }

    it('deve ter um job lint rodando npm run lint', () => {
      expect(jobBlock('lint')).toContain('npm run lint');
    });

    it('deve exigir o lint antes do deploy', () => {
      expect(jobBlock('deploy')).toMatch(/needs:[\s\S]*- lint/);
    });
  });
});
