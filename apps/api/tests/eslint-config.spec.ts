import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes da configuração do ESLint (issue #220)
// Até esta issue o monorepo só tinha Prettier (formatação), sem nenhuma
// análise estática. Estes testes garantem que o ESLint existe, é exposto por
// script em cada workspace, roda no pre-commit e bloqueia o deploy no CI.
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

  describe('pre-commit', () => {
    type Task = (files: string[]) => string | string[];

    async function loadConfig(): Promise<Record<string, Task>> {
      const module = await import(join(repoRoot, 'lint-staged.config.cjs'));
      return (module.default ?? module) as Record<string, Task>;
    }

    function commandsFor(config: Record<string, Task>, file: string): string[] {
      const extension = file.slice(file.lastIndexOf('.') + 1);
      const globs = Object.keys(config).filter((glob) =>
        glob
          .replace(/[*{}.]/g, ' ')
          .split(/[\s,]+/)
          .includes(extension),
      );
      return globs.flatMap((glob) => {
        const result = config[glob]([join(repoRoot, file)]);
        return Array.isArray(result) ? result : [result];
      });
    }

    it('deve manter a configuração fora do package.json', () => {
      expect(readJson('package.json')['lint-staged']).toBeUndefined();
      expect(existsSync(join(repoRoot, 'lint-staged.config.cjs'))).toBe(true);
    });

    // Globs sobrepostos rodam em paralelo no lint-staged: Prettier e ESLint
    // reescreveriam o mesmo arquivo ao mesmo tempo e um descartaria o outro.
    it('deve alcançar cada .ts por um único glob', async () => {
      const config = await loadConfig();
      const globsDoTs = Object.keys(config).filter((glob) =>
        glob
          .replace(/[*{}.]/g, ' ')
          .split(/[\s,]+/)
          .includes('ts'),
      );

      expect(globsDoTs).toHaveLength(1);
    });

    it('deve rodar eslint antes do prettier, na mesma sequência', async () => {
      const commands = commandsFor(await loadConfig(), 'apps/api/src/index.ts');

      const eslint = commands.findIndex((c) => c.startsWith('eslint --fix'));
      const prettier = commands.findIndex((c) =>
        c.startsWith('prettier --write'),
      );
      expect(eslint).toBeGreaterThanOrEqual(0);
      expect(prettier).toBeGreaterThan(eslint);
    });

    // Rodando da raiz, o ESLint usa a config da raiz, que ignora apps/web.
    it('deve analisar .ts do frontend com a config do web', async () => {
      const commands = commandsFor(
        await loadConfig(),
        'apps/web/src/app/app.config.ts',
      );

      expect(
        commands.some((c) =>
          c.startsWith('eslint --fix --config apps/web/eslint.config.mjs'),
        ),
      ).toBe(true);
    });

    it('deve analisar templates .html do frontend', async () => {
      const commands = commandsFor(
        await loadConfig(),
        'apps/web/src/app/app.component.html',
      );

      expect(
        commands.some((c) =>
          c.startsWith('eslint --fix --config apps/web/eslint.config.mjs'),
        ),
      ).toBe(true);
    });

    it('não deve usar a config do web para arquivos da API', async () => {
      const commands = commandsFor(await loadConfig(), 'apps/api/src/index.ts');

      expect(commands.join(' ')).not.toContain('apps/web/eslint.config.mjs');
    });
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
