import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HealthService } from '../../core/services/health.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly healthService = inject(HealthService);
  private readonly authService = inject(AuthService);

  healthStatus: string | null = null;
  healthProject: string | null = null;
  healthError: string | null = null;
  isAdmin = signal(false);

  ngOnInit(): void {
    this.authService.isAdmin().then((isAdmin) => this.isAdmin.set(isAdmin));

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
}
