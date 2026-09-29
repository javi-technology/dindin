import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes dos índices versionados do Firestore (issue #450)
// A consulta por provedor da carteira sugerida ordena por `__name__` em ordem
// descendente. O Firestore indexa `__name__` sozinho só em ordem ascendente,
// então a consulta respondia FAILED_PRECONDITION em produção — falha que não
// aparece na suíte, porque as camadas usam Firestore mockado, nem no
// emulador, que não valida índice. Só o arquivo versionado pode denunciá-la.
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

  it('deve declarar o índice descendente por id de recommendedWallets', () => {
    expect(hasDescendingNameIndex('recommendedWallets')).toBe(true);
  });

  it('deve manter a consulta por provedor ordenada pelo id descendente', () => {
    // O índice acima existe por causa desta consulta: se ela deixar de
    // ordenar por id descendente, o índice perde a razão de ser e este teste
    // avisa antes de o arquivo acumular índice órfão.
    expect(serviceSource).toContain("orderBy(FieldPath.documentId(), 'desc')");
  });
});
