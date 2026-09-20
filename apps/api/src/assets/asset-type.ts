import type { AssetType } from 'dindin-models';

/**
 * Tipos de ativo em runtime, para a API (issue #303).
 *
 * A fonte da verdade continua sendo `AssetType`, em `dindin-models`. A lista
 * é reconstruída aqui porque a API **não pode importar valor** de um pacote
 * do monorepo: o `npm install` do Cloud Build lê só o `apps/api/package.json`,
 * onde `dindin-models` não pode entrar (não está no registry), então um
 * `require('dindin-models')` no `lib/` derrubaria a Function no cold start.
 * Importar o tipo é seguro — o TypeScript o apaga na compilação.
 *
 * O `Record<AssetType, true>` é o que impede a divergência: incluir um tipo
 * novo no union quebra a compilação aqui até que ele seja listado. O web, que
 * declara `dindin-models` como dependência e passa por bundler, usa
 * `ASSET_TYPES` do pacote direto.
 */
const ASSET_TYPE_MAP: Record<AssetType, true> = {
  FII: true,
  STOCK: true,
  ETF: true,
  REIT: true,
  OTHER: true,
};

/** Tipos de ativo suportados, na ordem em que aparecem nas mensagens de erro. */
export const ASSET_TYPES = Object.keys(ASSET_TYPE_MAP) as AssetType[];

// Um Set, e não `value in ASSET_TYPE_MAP`: o `in` enxerga o prototype, então
// 'toString' e 'constructor' passariam por tipo de ativo.
const SUPPORTED = new Set<string>(ASSET_TYPES);

/** Se o valor é um tipo de ativo suportado. */
export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && SUPPORTED.has(value);
}
