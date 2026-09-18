import { getFirestore } from 'firebase-admin/firestore';
import { Fridge, Wallet } from 'dindin-models';
import { DefaultResource, SetupResponse } from 'dindin-shared-types';
import {
  fridgesCollection,
  userDocument,
  walletsCollection,
} from '../firestore/paths';

export const DEFAULT_WALLET_NAME = 'Carteira Principal';
export const DEFAULT_FRIDGE_NAME = 'Geladeira Principal';

/**
 * Garante a Carteira Principal e a Geladeira Principal do usuário (#275).
 *
 * Sem `resource`, é o provisionamento automático do login: roda uma única vez
 * por usuário, marcado por `users/{uid}.defaultsProvisionedAt`, para que uma
 * carteira ou geladeira apagada depois não volte sozinha. Com `resource`, é o
 * pedido explícito do botão de fallback e ignora o marcador só para aquele
 * recurso.
 *
 * Marcador, leituras e criações ficam na mesma transação: duas abas ou um
 * retry concorrente são serializados pelo Firestore, e o segundo já encontra
 * o que o primeiro criou.
 */
export async function provisionDefaults(
  userId: string,
  resource?: DefaultResource,
): Promise<SetupResponse> {
  const userRef = userDocument(userId);

  return getFirestore().runTransaction(async (tx) => {
    const [userSnapshot, walletsSnapshot, fridgesSnapshot] = await Promise.all([
      tx.get(userRef),
      tx.get(walletsCollection(userId).limit(1)),
      tx.get(fridgesCollection(userId).limit(1)),
    ]);

    const provisioned =
      userSnapshot.data()?.['defaultsProvisionedAt'] !== undefined;
    const wants = (target: DefaultResource) =>
      resource === undefined ? !provisioned : resource === target;
    const walletCreated = wants('wallet') && walletsSnapshot.empty;
    const fridgeCreated = wants('fridge') && fridgesSnapshot.empty;

    const now = new Date().toISOString();
    if (walletCreated) {
      const wallet: Omit<Wallet, 'id'> = {
        ownerId: userId,
        name: DEFAULT_WALLET_NAME,
        description: '',
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      };
      tx.create(walletsCollection(userId).doc(), wallet);
    }
    if (fridgeCreated) {
      const fridge: Omit<Fridge, 'id'> = {
        ownerId: userId,
        name: DEFAULT_FRIDGE_NAME,
        description: '',
        createdAt: now,
        updatedAt: now,
      };
      tx.create(fridgesCollection(userId).doc(), fridge);
    }
    if (!provisioned) {
      tx.set(userRef, { defaultsProvisionedAt: now }, { merge: true });
    }

    return { walletCreated, fridgeCreated };
  });
}
