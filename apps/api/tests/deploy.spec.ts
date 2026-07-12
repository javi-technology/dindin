import { readFileSync } from 'fs';
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
