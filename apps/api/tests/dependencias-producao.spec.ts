import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Dependências de produção sem advisory conhecido (issue #510)
//
// O job `audit` do CI só reprova a partir de `high`, então uma moderada passa
// batido. A `uuid` anterior à 11.1.1 (GHSA-w5hq-g745-h8pq) chegava à produção
// por `firebase-admin` → `@google-cloud/storage` → `gaxios`, e o override de
// `gaxios@6` que existia para ela não surtia efeito: o lock seguia na 9.0.1.
// Este teste lê o lock, e não a saída do `npm audit`, para rodar sem rede.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

interface LockPackage {
  version?: string;
  dev?: boolean;
}

const lock = JSON.parse(
  readFileSync(join(repoRoot, 'package-lock.json'), 'utf-8'),
) as { packages: Record<string, LockPackage> };

/** Compara `x.y.z` numericamente; basta para versões estáveis. */
function isOlderThan(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);

  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

describe('dependências de produção', () => {
  // `dev: true` é só de desenvolvimento e fica de fora. `devOptional` entra: é
  // alcançável por dependência opcional de produção (o `firebase-admin` traz
  // `@google-cloud/storage` como opcional) e vai junto num `npm ci --omit=dev`.
  const emProducao = (entradas: [string, LockPackage][]) =>
    entradas.filter(([, pacote]) => pacote.dev !== true);

  const copiasDe = (nome: string) =>
    Object.entries(lock.packages).filter(([caminho]) =>
      caminho.endsWith(`node_modules/${nome}`),
    );

  it('deve existir ao menos uma cópia de uuid no lock (o teste enxerga o pacote)', () => {
    expect(copiasDe('uuid').length).toBeGreaterThan(0);
  });

  it('não deve ter uuid anterior à 11.1.1 (GHSA-w5hq-g745-h8pq)', () => {
    const vulneraveis = emProducao(copiasDe('uuid'))
      .filter(([, pacote]) => isOlderThan(pacote.version ?? '0.0.0', '11.1.1'))
      .map(([caminho, pacote]) => `${caminho}@${pacote.version}`);

    expect(vulneraveis).toEqual([]);
  });
});
