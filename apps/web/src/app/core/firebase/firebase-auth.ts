import { InjectionToken, Provider } from '@angular/core';
import { FirebaseOptions, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
} from 'firebase/auth';
import { Observable } from 'rxjs';

/**
 * Autenticação do Firebase (issue #364).
 *
 * O `@angular/fire` saiu porque não tem versão estável para o Angular 21+ e
 * prendia o SDK `firebase` numa faixa antiga. Como quase tudo que ele expunha
 * em `@angular/fire/auth` era reexport do `firebase/auth`, restaram só as três
 * peças deste arquivo: o token de injeção, o provider e o `authState`.
 */
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/**
 * Inicializa o app e o Auth, e os registra na injeção de dependências.
 *
 * O `getAuth` recebe o app explicitamente em vez de recorrer ao app padrão
 * global: o registro fica a um passo da inicialização, sem depender de ordem
 * de importação.
 */
export function provideFirebaseAuth(
  options: FirebaseOptions,
  useEmulators = false,
): Provider {
  return {
    provide: FIREBASE_AUTH,
    useFactory: (): Auth => {
      const auth = getAuth(initializeApp(options));
      if (useEmulators) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099');
      }
      return auth;
    },
  };
}

/**
 * Usuário autenticado como Observable.
 *
 * O `onAuthStateChanged` devolve a função de cancelamento, que vira o teardown
 * da assinatura — sem isso cada assinatura deixaria um listener vivo no SDK.
 */
export function authState(auth: Auth): Observable<User | null> {
  return new Observable<User | null>((subscriber) =>
    onAuthStateChanged(
      auth,
      (user) => subscriber.next(user),
      (error) => subscriber.error(error),
    ),
  );
}
