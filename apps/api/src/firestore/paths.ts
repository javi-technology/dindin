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

/** Coleção raiz de usuários — usada também para varrer a base nos jobs. */
export function usersCollection() {
  return getFirestore().collection('users');
}

export function userDocument(userId: string) {
  return usersCollection().doc(userId);
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

export function aiSuggestionsCollection(userId: string) {
  return userDocument(userId).collection('aiSuggestions');
}

export function aiSuggestionUsageCollection(userId: string) {
  return userDocument(userId).collection('aiSuggestionUsage');
}

/** Assinatura do usuário — documento único dentro de `billing`. */
export function subscriptionDocument(userId: string) {
  return userDocument(userId).collection('billing').doc('subscription');
}

/** Catálogo de ativos suportados. */
export function assetsCollection() {
  return getFirestore().collection('assets');
}

/** Cotações, indexadas pelo ticker. */
export function quotesCollection() {
  return getFirestore().collection('quotes');
}

/** Histórico de preços de um ticker. */
export function quoteHistoryCollection(ticker: string) {
  return quotesCollection().doc(ticker).collection('history');
}

/** Histórico de proventos mensais de um ticker. */
export function quoteDividendHistoryCollection(ticker: string) {
  return quotesCollection().doc(ticker).collection('dividendHistory');
}

/** Carteiras recomendadas do BB. */
export function recommendedWalletsCollection() {
  return getFirestore().collection('recommendedWallets');
}

/** Eventos de billing já processados — idempotência dos webhooks. */
export function billingEventsCollection() {
  return getFirestore().collection('billingEvents');
}
