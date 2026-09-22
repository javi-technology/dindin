import { Auth, User } from 'firebase/auth';
import { authState } from './firebase-auth';

// ---------------------------------------------------------------------------
// Testes do authState (issue #364)
//
// O `@angular/fire` saiu porque não tem versão estável para o Angular 21+.
// Dele só havia uma peça com lógica própria: o `authState`, que transforma o
// callback `onAuthStateChanged` em Observable. Este é o substituto.
// ---------------------------------------------------------------------------

describe('authState', () => {
  let observador: ((user: User | null) => void) | null;
  let desinscrito: boolean;
  let auth: Auth;

  beforeEach(() => {
    observador = null;
    desinscrito = false;
    auth = {
      onAuthStateChanged: (callback: (user: User | null) => void) => {
        observador = callback;
        return () => {
          desinscrito = true;
        };
      },
    } as unknown as Auth;
  });

  const usuario = { uid: 'user-1' } as User;

  it('deve emitir o usuário que o Firebase informar', () => {
    const recebidos: (User | null)[] = [];
    authState(auth).subscribe((user) => recebidos.push(user));

    observador?.(usuario);

    expect(recebidos).toEqual([usuario]);
  });

  it('deve emitir null ao deslogar', () => {
    const recebidos: (User | null)[] = [];
    authState(auth).subscribe((user) => recebidos.push(user));

    observador?.(usuario);
    observador?.(null);

    expect(recebidos).toEqual([usuario, null]);
  });

  // Sem isto, cada assinatura deixaria um listener vivo no SDK.
  it('deve cancelar o listener ao encerrar a assinatura', () => {
    const assinatura = authState(auth).subscribe();

    expect(desinscrito).toBeFalse();
    assinatura.unsubscribe();

    expect(desinscrito).toBeTrue();
  });
});
