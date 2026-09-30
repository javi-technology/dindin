import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes dos índices versionados do Firestore (issue #450)
// A consulta por provedor da carteira sugerida ordenava `__name__` em ordem
// descendente. O Firestore indexa `__name__` sozinho só em ordem ascendente,
// então ela respondia FAILED_PRECONDITION em produção sem o índice
// descendente — falha que não aparece na suíte, porque as camadas usam
// Firestore mockado. Só o arquivo versionado podia denunciá-la.
//
// Desde a issue #485 a consulta é ascendente, porque o emulador recusa a
// varredura descendente por chave. O Firestore cobre a ascendente sem índice
// composto, e o índice descendente ficou no arquivo: remover índice é ato
// deliberado, feito à mão (o deploy roda sem `--force`).
// ---------------------------------------------------------------------------

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
type CompositeIndex = {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
};

describe('firestore.indexes.json', () => {
  const indexes = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', '..', 'firestore.indexes.json'),
      'utf-8',
    ),
  ) as { indexes: CompositeIndex[] };

  /** Fontes da API, para casar consulta e índice sem depender de rede. */
  const serviceSource = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'src',
      'recommended-wallet',
      'recommended-wallet.service.ts',
    ),
    'utf-8',
  );

  function hasDescendingNameIndex(collectionGroup: string): boolean {
    return indexes.indexes.some(
      (index) =>
        index.collectionGroup === collectionGroup &&
        index.queryScope === 'COLLECTION' &&
        index.fields.length === 1 &&
        index.fields[0].fieldPath === '__name__' &&
        index.fields[0].order === 'DESCENDING',
    );
  }

  // Remover o índice é ato deliberado (o deploy não o apaga sozinho): quem o
  // fizer atualiza este teste junto.
  it('deve manter versionado o índice descendente por id de recommendedWallets', () => {
    expect(hasDescendingNameIndex('recommendedWallets')).toBe(true);
  });

  it('deve manter a consulta por provedor ordenada pelo id ascendente', () => {
    // Ascendente dispensa índice composto em produção. Voltar a `desc` traria
    // de volta o erro do emulador da issue #485 e passaria a depender do
    // índice descendente.
    expect(serviceSource).toContain('orderBy(FieldPath.documentId())');
    expect(serviceSource).not.toMatch(
      /orderBy\(FieldPath\.documentId\(\), 'desc'\)/,
    );
  });
});
