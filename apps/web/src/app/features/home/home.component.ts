import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HealthService } from '../../core/services/health.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly healthService = inject(HealthService);

  healthStatus: string | null = null;
  healthProject: string | null = null;
  healthError: string | null = null;

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
}
