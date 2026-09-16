import { Position } from 'dindin-models';
import { positionsCollection, walletsCollection } from '../firestore/paths';

/**
 * Leitura de posições do usuário, de uma carteira ou de todas (issue #225).
 *
 * Morava dentro do `dividend.controller`, embora não tenha nada de proventos:
 * é utilitário de leitura de carteira, que os cálculos de projeção e de yield
 * apenas consomem.
 *
 * Sem `walletId`, percorre as carteiras do usuário e concatena as posições.
 * Não usa consulta por collection group de propósito: ela alcançaria posições
 * de carteiras já excluídas, e navegar a partir das carteiras existentes
 * garante que só o que está vivo entra no cálculo.
 */
export async function getAllUserPositions(
  userId: string,
  walletId?: string,
): Promise<Position[]> {
  if (walletId) {
    const snapshot = await positionsCollection(userId, walletId).get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    );
  }

  const walletsSnapshot = await walletsCollection(userId).get();

  const positionsByWallet = await Promise.all(
    walletsSnapshot.docs.map((walletDoc) =>
      walletDoc.ref.collection('positions').get(),
    ),
  );

  return positionsByWallet.flatMap((snapshot) =>
    snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Position),
  );
}
