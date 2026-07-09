import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HealthService } from './core/services/health.service';

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

  constructor(private healthService: HealthService) {}

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
