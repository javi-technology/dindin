import {
  CollectionReference,
  DocumentReference,
  getFirestore,
} from 'firebase-admin/firestore';

/** Máximo de operações aceitas num único batch do Firestore. */
export const BATCH_LIMIT = 500;

/**
 * Remove todos os documentos de uma subcoleção, em lotes de até 500 operações.
 *
 * O limite de 500 por batch é do Firestore: acima dele o commit falha por
 * inteiro e nada é excluído. Por isso os documentos são fatiados em lotes
 * sequenciais, em vez de um único batch — o mesmo raciocínio já aplicado no
 * `update-quotes.handler`, que processa tickers em lotes.
 */
export async function deleteSubcollection(
  collection: CollectionReference,
): Promise<void> {
  const snapshot = await collection.get();
  const { docs } = snapshot;

  for (let index = 0; index < docs.length; index += BATCH_LIMIT) {
    const batch = getFirestore().batch();
    docs
      .slice(index, index + BATCH_LIMIT)
      .forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

/**
 * Remove as subcoleções indicadas e, por último, o próprio documento.
 *
 * O Firestore não cascadeia deletes: apagar só o pai deixa os filhos órfãos e
 * inacessíveis pela API, que os alcança navegando a partir do pai (issue #219).
 *
 * A ordem importa. Apagar o pai por último mantém o invariante de que, se a
 * operação falhar no meio, o pai continua existindo e a exclusão pode ser
 * repetida sem deixar resíduo. Apagar o pai primeiro tornaria os filhos
 * restantes inalcançáveis — exatamente o defeito que esta função corrige.
 */
export async function deleteDocumentCascading(
  document: DocumentReference,
  subcollections: string[],
): Promise<void> {
  for (const name of subcollections) {
    await deleteSubcollection(document.collection(name));
  }

  await document.delete();
}
