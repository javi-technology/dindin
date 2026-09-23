import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Alinhamento do TypeScript entre os workspaces (issue #320)
//
// O frontend foi para o TypeScript 6.0 com o Angular 22 (#315) enquanto a API
// seguia no 5.x: os dois checavam tipos com majors diferentes, e os pacotes de
// `packages/` são consumidos como código-fonte pelos dois lados — a mesma
// declaração passava por dois compiladores distintos.
//
// A versão passa a ser declarada num lugar só, na raiz, e os workspaces a
// herdam pelo hoisting do npm.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const PACOTES = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/models/package.json',
  'packages/shared-types/package.json',
];

function declaracaoDeTypeScript(caminho: string): string | undefined {
  const pkg = JSON.parse(readFileSync(join(repoRoot, caminho), 'utf-8'));
  return { ...pkg.dependencies, ...pkg.devDependencies }['typescript'];
}

describe('versão do TypeScript no monorepo', () => {
  const declaracoes = PACOTES.map((caminho) => ({
    caminho,
    versao: declaracaoDeTypeScript(caminho),
  })).filter((item) => item.versao !== undefined);

  it('deve declarar o TypeScript em um único package.json', () => {
    expect(declaracoes.map((item) => item.caminho)).toEqual(['package.json']);
  });

  // O Angular 22 declara peer `typescript: >=6.0 <6.1`; sair dessa faixa
  // quebra o build do frontend.
  it('deve declarar a faixa 6.0, exigida pelo Angular 22', () => {
    const [, major, minor] = /(\d+)\.(\d+)/.exec(declaracoes[0].versao!) ?? [];

    expect(Number(major)).toBe(6);
    expect(Number(minor)).toBe(0);
  });

  it('deve resolver a mesma versão para api e web', () => {
    const resolvida = (workspace: string): string =>
      JSON.parse(
        readFileSync(
          join(
            repoRoot,
            workspace,
            'node_modules',
            'typescript',
            'package.json',
          ),
          'utf-8',
        ),
      ).version;

    // Sem cópia própria em node_modules, o workspace usa a da raiz — que é o
    // resultado esperado depois do hoisting.
    const daRaiz = JSON.parse(
      readFileSync(
        join(repoRoot, 'node_modules', 'typescript', 'package.json'),
        'utf-8',
      ),
    ).version;

    for (const workspace of ['apps/api', 'apps/web']) {
      let versao = daRaiz;
      try {
        versao = resolvida(workspace);
      } catch {
        // sem cópia local: herda a da raiz
      }
      expect(versao).toBe(daRaiz);
    }
  });
});
