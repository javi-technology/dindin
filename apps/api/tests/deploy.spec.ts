import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes de configuração de deploy (issue #9)
// Garante que o apps/api/package.json não declare pacotes internos do
// monorepo (não publicados no registry) em "dependencies", pois isso quebra
// o `npm install` feito pelo Cloud Build durante o deploy das Cloud Functions.
// Pacotes internos que contêm apenas tipos devem ficar em "devDependencies"
// (resolvidos localmente via npm workspaces durante o build) ou ser removidos
// se não forem necessários em runtime.
// ---------------------------------------------------------------------------

describe('apps/api/package.json – dependências de deploy', () => {
  function readApiPackageJson(): Record<string, unknown> {
    const pkgPath = join(__dirname, '..', 'package.json');
    const raw = readFileSync(pkgPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('não deve declarar dindin-models em dependencies', () => {
    const pkg = readApiPackageJson();
    const dependencies = (pkg.dependencies as Record<string, string>) ?? {};
    expect(dependencies).not.toHaveProperty('dindin-models');
  });

  it('não deve declarar dindin-models em devDependencies', () => {
    const pkg = readApiPackageJson();
    const devDependencies =
      (pkg.devDependencies as Record<string, string>) ?? {};
    expect(devDependencies).not.toHaveProperty('dindin-models');
  });

  it('não deve declarar dindin-shared-types em dependencies', () => {
    const pkg = readApiPackageJson();
    const dependencies = (pkg.dependencies as Record<string, string>) ?? {};
    expect(dependencies).not.toHaveProperty('dindin-shared-types');
  });
});

// ---------------------------------------------------------------------------
// Pacotes internos não podem sobrar no JS compilado (issue #303)
//
// Como não estão no registry nem no `package.json` da API, o `npm install` do
// Cloud Build não os instala: um `require('dindin-models')` no `lib/` derruba
// a Function no cold start, e com ela todo o `/api/**`. Localmente o defeito
// não aparece, porque o symlink do workspace resolve o pacote.
//
// Importar só **tipos** é seguro: o TypeScript os apaga na compilação. O teste
// olha o resultado da compilação, que é o que vai para o deploy.
// ---------------------------------------------------------------------------

describe('apps/api/lib – pacotes internos no JS compilado', () => {
  const libPath = join(__dirname, '..', 'lib');

  function compiledFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return compiledFiles(entryPath);
      return entry.name.endsWith('.js') ? [entryPath] : [];
    });
  }

  it('deve encontrar o resultado do build (rode npm run api:build antes)', () => {
    expect(existsSync(libPath)).toBe(true);
  });

  it.each(['dindin-models', 'dindin-shared-types'])(
    'não deve exigir %s em runtime',
    (packageName) => {
      const offenders = compiledFiles(libPath).filter((file) =>
        readFileSync(file, 'utf-8').includes(`require("${packageName}")`),
      );

      expect(offenders).toEqual([]);
    },
  );
});
