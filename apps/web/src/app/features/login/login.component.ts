import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async loginWithEmail(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.authService.loginWithEmail(this.email, this.password);
      await this.router.navigate(['/']);
    } catch {
      this.error.set('E-mail ou senha inválidos.');
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.authService.loginWithGoogle();
      await this.router.navigate(['/']);
    } catch {
      this.error.set('Erro ao fazer login com Google.');
    } finally {
      this.loading.set(false);
    }
  }
}
