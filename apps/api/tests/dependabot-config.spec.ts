import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes da configuração do Dependabot (issue #144)
// Garante version updates semanais e agrupados para npm e GitHub Actions,
// abertos contra a develop (fluxo do projeto), sem majors do Angular — que
// exigem `ng update` com migrações e são tratados em issue própria.
// ---------------------------------------------------------------------------

describe('.github/dependabot.yml', () => {
  const configPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'dependabot.yml',
  );
  const config = existsSync(configPath)
    ? readFileSync(configPath, 'utf-8')
    : '';

  /** Bloco de um ecossistema: de `- package-ecosystem` até o próximo. */
  function ecosystemBlock(name: string): string {
    const match = new RegExp(
      `- package-ecosystem: ['"]?${name}['"]?\\n([\\s\\S]*?)(?=^ {2}- package-ecosystem|(?![\\s\\S]))`,
      'm',
    ).exec(config);
    return match?.[1] ?? '';
  }

  it('deve usar a versão 2 do formato', () => {
    expect(config).toMatch(/^version: 2$/m);
  });

  describe.each(['npm', 'github-actions'])('ecossistema %s', (ecosystem) => {
    const block = ecosystemBlock(ecosystem);

    it('deve estar configurado no diretório raiz', () => {
      expect(block).toMatch(/directory: ['"]?\/['"]?$/m);
    });

    it('deve rodar semanalmente contra a develop', () => {
      expect(block).toMatch(/interval: ['"]?weekly['"]?$/m);
      expect(block).toMatch(/target-branch: ['"]?develop['"]?$/m);
    });

    it('deve rotular com dependencies e usar prefixo chore(deps)', () => {
      expect(block).toMatch(/labels:\s*\n\s*- ['"]?dependencies['"]?$/m);
      expect(block).toMatch(/prefix: ['"]?chore['"]?$/m);
      expect(block).toMatch(/include: ['"]?scope['"]?$/m);
    });

    it('deve limitar os PRs abertos', () => {
      expect(block).toMatch(/open-pull-requests-limit: \d+$/m);
    });
  });

  describe('npm', () => {
    const npm = ecosystemBlock('npm');

    it.each(['angular', 'firebase', 'dev-tooling', 'minor-and-patch'])(
      'deve ter o grupo %s',
      (group) => {
        expect(npm).toMatch(new RegExp(`^ {6}${group}:$`, 'm'));
      },
    );

    it('deve ignorar majors do Angular e do @angular/fire', () => {
      const ignore = /ignore:\n([\s\S]*?)(?=^ {4}\S|(?![\s\S]))/m.exec(
        npm,
      )?.[1];

      expect(ignore).toContain('@angular/*');
      expect(ignore).toContain('@angular-devkit/*');
      expect(ignore).toContain('version-update:semver-major');
    });
  });
});
