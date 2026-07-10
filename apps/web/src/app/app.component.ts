import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HealthService } from './core/services/health.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'dindin-web';
  healthStatus: string | null = null;
  healthProject: string | null = null;
  healthError: string | null = null;

  private readonly healthService = inject(HealthService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  user = this.authService.user;

  ngOnInit(): void {
    this.healthService.check().subscribe({
      next: (response) => {
        this.healthStatus = response.status;
        this.healthProject = response.project;
      },
      error: (err) => {
        this.healthError =
          err.message || 'Não foi possível conectar ao backend.';
      },
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/login']);
  }
}
