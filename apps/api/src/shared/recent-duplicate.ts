import type {
  CollectionReference,
  DocumentData,
} from 'firebase-admin/firestore';

import { HttpError } from './http-error';

/**
 * Janela em que um envio idêntico ao anterior é tratado como repetição.
 *
 * Cobre o toque repetido e o retry de rede, que chegam em segundos. Quem
 * cadastra de propósito a mesma compra duas vezes leva mais que isso entre uma
 * e outra, e passa a ser aceito.
 */
export const DUPLICATE_WINDOW_MS = 10_000;

/** Campos de controle: mudam a cada envio, então não entram na comparação. */
const CONTROL_FIELDS = new Set(['createdAt', 'updatedAt']);

type Data = DocumentData & { ticker: string; createdAt: string };

/**
 * Compara as chaves dos **dois** registros: o campo que só existe no anterior
 * (uma posição com preço-alvo, seguida de outra igual sem ele) também
 * diferencia. Campo ausente e `null` são o mesmo valor.
 */
function sameValues(existing: DocumentData, incoming: Data): boolean {
  const fields = new Set([...Object.keys(existing), ...Object.keys(incoming)]);

  return [...fields]
    .filter((field) => !CONTROL_FIELDS.has(field))
    .every((field) => (existing[field] ?? null) === (incoming[field] ?? null));
}

function isRecent(existing: DocumentData, incoming: Data): boolean {
  const existingAt = Date.parse(existing.createdAt as string);
  const incomingAt = Date.parse(incoming.createdAt);

  return incomingAt - existingAt < DUPLICATE_WINDOW_MS;
}

/**
 * Grava o documento, a menos que um idêntico tenha acabado de ser gravado
 * (issue #497).
 *
 * Tocar de novo quando a resposta demora é o comportamento normal do usuário,
 * e o resultado seria posição ou item duplicado: quantidade dobrada, erro de
 * dado financeiro. O cliente também se protege, mas um app antigo, um retry de
 * rede ou um segundo dispositivo não passam por essa proteção, então a API
 * recusa por conta própria, com 409.
 *
 * É uma transação, e não uma consulta seguida de `add`: o toque repetido
 * chega em milissegundos, e dois pedidos lendo antes de qualquer um gravar
 * criariam os dois documentos. A consulta é só por `ticker` (igualdade, sem
 * índice composto) e a comparação do restante é feita aqui.
 *
 * Devolve o id do documento criado.
 */
export async function addUnlessRecentDuplicate(
  collection: CollectionReference,
  data: Data,
): Promise<string> {
  return collection.firestore.runTransaction(async (transaction) => {
    const sameTicker = await transaction.get(
      collection.where('ticker', '==', data.ticker),
    );

    const duplicate = sameTicker.docs.some((doc) => {
      const existing = doc.data();
      return isRecent(existing, data) && sameValues(existing, data);
    });

    if (duplicate) {
      throw HttpError.conflict(
        'Um registro idêntico foi enviado há instantes. Confira a lista antes de tentar de novo.',
      );
    }

    const ref = collection.doc();
    transaction.create(ref, data);

    return ref.id;
  });
}
