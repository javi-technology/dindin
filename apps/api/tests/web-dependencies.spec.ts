import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes de versões do frontend (issue #143)
// Angular 19 está fora de suporte e acumula alertas high/medium sem patch.
// Garante que apps/web esteja no Angular 22 e com TypeScript na faixa que ele
// exige. O @angular/fire saiu na #364 e o teste agora impede que ele volte.
// ---------------------------------------------------------------------------

describe('apps/web/package.json – versões do Angular', () => {
  function readWebPackageJson(): Record<string, Record<string, string>> {
    const pkgPath = join(__dirname, '..', '..', 'web', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  }

  function majorOf(range: string | undefined): number {
    const match = /(\d+)\./.exec(range ?? '');
    return match ? Number(match[1]) : NaN;
  }

  const pkg = readWebPackageJson();
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  it.each(Object.keys(deps).filter((name) => name.startsWith('@angular/')))(
    '%s deve estar no major 22',
    (name) => {
      expect(majorOf(deps[name])).toBe(22);
    },
  );

  it('deve declarar @angular/core', () => {
    expect(deps['@angular/core']).toBeDefined();
  });

  // O @angular/fire saiu na #364: não tinha versão estável para o Angular 21+
  // e prendia o SDK `firebase` numa faixa antiga. O front passou a usar o SDK
  // direto, então o pacote não pode voltar sem uma decisão explícita.
  it('não deve declarar @angular/fire', () => {
    expect(deps['@angular/fire']).toBeUndefined();
  });

  // O Angular 22 declara peer `typescript: >=6.0 <6.1`.
  it('deve usar TypeScript na faixa 6.0', () => {
    const [, major, minor] = /(\d+)\.(\d+)/.exec(deps['typescript']) ?? [];
    expect(Number(major)).toBe(6);
    expect(Number(minor)).toBe(0);
  });
});
