import { Injectable, inject } from '@angular/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { FIREBASE_AUTH, authState } from '../firebase/firebase-auth';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  user$ = authState(this.auth);
  user = toSignal(this.user$, { initialValue: null as User | null });

  async loginWithEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async registerWithEmail(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(this.auth, provider);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  /** Verifica se o usuário logado possui a custom claim `admin: true`. */
  async isAdmin(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;
    const tokenResult = await user.getIdTokenResult(true);
    return tokenResult.claims['admin'] === true;
  }
}
