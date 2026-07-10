import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  error: string | null = null;
  loading = false;

  async loginWithEmail(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      await this.authService.loginWithEmail(this.email, this.password);
      await this.router.navigate(['/']);
    } catch (err) {
      this.error = 'E-mail ou senha inválidos.';
    } finally {
      this.loading = false;
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      await this.authService.loginWithGoogle();
      await this.router.navigate(['/']);
    } catch (err) {
      this.error = 'Erro ao fazer login com Google.';
    } finally {
      this.loading = false;
    }
  }
}
