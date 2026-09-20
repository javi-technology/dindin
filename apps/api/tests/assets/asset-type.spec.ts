import { ASSET_TYPES as PACKAGE_ASSET_TYPES } from 'dindin-models';
import { ASSET_TYPES, isAssetType } from '../../src/assets/asset-type';

// ---------------------------------------------------------------------------
// Tipos de ativo em runtime na API (issue #303)
//
// A API não pode importar valor de `dindin-models` — o pacote não vai para o
// deploy das Functions —, então a lista é reconstruída em `asset-type.ts` a
// partir do tipo. O `Record<AssetType, true>` impede que falte um tipo (não
// compila), e este teste garante que as duas listas não se afastem.
// ---------------------------------------------------------------------------

describe('assets/asset-type', () => {
  it('deve ter a mesma lista de dindin-models', () => {
    expect(ASSET_TYPES).toEqual([...PACKAGE_ASSET_TYPES]);
  });

  it('deve reconhecer os tipos válidos', () => {
    expect(ASSET_TYPES.every((type) => isAssetType(type))).toBe(true);
  });

  it('deve recusar valores fora da lista', () => {
    expect(isAssetType('BDR')).toBe(false);
    expect(isAssetType('fii')).toBe(false);
    expect(isAssetType(undefined)).toBe(false);
    expect(isAssetType(7)).toBe(false);
  });

  // `in` também acha membros do prototype: sem a checagem de string, valores
  // como 'toString' ou 'constructor' passariam por tipo de ativo.
  it('não deve aceitar propriedades herdadas de Object', () => {
    expect(isAssetType('toString')).toBe(false);
    expect(isAssetType('constructor')).toBe(false);
  });
});
