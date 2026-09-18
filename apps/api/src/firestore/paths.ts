import { Request } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Caminhos das coleções do Firestore, num único lugar (issue #222).
 *
 * Antes, `getFirestore().collection('users')...` era remontado à mão em 19
 * pontos e `positionsCollection` existia idêntica em três controllers. Uma
 * divergência de string entre dois arquivos apontaria para a coleção errada
 * sem gerar erro de compilação — o tipo de defeito que só aparece em produção.
 */

/** Retorna o uid do usuário autenticado. O authMiddleware garante a presença. */
export function uid(req: Request): string {
  return (req as AuthRequest).user!.uid;
}

function userDocument(userId: string) {
  return getFirestore().collection('users').doc(userId);
}

export function walletsCollection(userId: string) {
  return userDocument(userId).collection('wallets');
}

export function positionsCollection(userId: string, walletId: string) {
  return walletsCollection(userId).doc(walletId).collection('positions');
}

export function fridgesCollection(userId: string) {
  return userDocument(userId).collection('fridges');
}

export function fridgeItemsCollection(userId: string, fridgeId: string) {
  return fridgesCollection(userId).doc(fridgeId).collection('fridgeItems');
}

export function alertsCollection(userId: string) {
  return userDocument(userId).collection('alerts');
}

export function dividendsCollection(userId: string) {
  return userDocument(userId).collection('dividends');
}

export function patrimonySnapshotsCollection(userId: string) {
  return userDocument(userId).collection('patrimonySnapshots');
}
