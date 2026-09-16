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
    it('deve rodar eslint --fix nos arquivos TypeScript via lint-staged', () => {
      const pkg = readJson('package.json');
      const lintStaged = pkg['lint-staged'] as Record<string, string[]>;

      // Mais de um glob pode alcançar `.ts` (o do Prettier também), então o
      // que importa é existir um glob que alcance `.ts` e rode o eslint.
      const eslintPatterns = Object.entries(lintStaged)
        .filter(([, commands]) => commands.join(' ').includes('eslint --fix'))
        .map(([pattern]) => pattern);

      expect(eslintPatterns.length).toBeGreaterThan(0);
      expect(
        eslintPatterns.some(
          (pattern) => pattern.includes('.ts') || pattern.includes(',ts'),
        ),
      ).toBe(true);
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
