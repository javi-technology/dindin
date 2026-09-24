import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideSun, LucideMoon, LucideMonitor } from '@lucide/angular';
import {
  ThemePreference,
  ThemeService,
} from '../../../core/services/theme.service';

/**
 * Alternância entre claro, escuro e o padrão do sistema (issue #394).
 *
 * São três botões, e não um interruptor de duas posições: com dois estados não
 * haveria como voltar a seguir o sistema depois de escolher um tema.
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideSun, LucideMoon, LucideMonitor],
  template: `
    <div
      role="group"
      aria-label="Tema da interface"
      class="inline-flex items-center gap-1 rounded-full border border-border p-0.5"
      data-testid="theme-toggle"
    >
      @for (option of options; track option.value) {
        <button
          type="button"
          class="rounded-full p-1.5 transition-colors"
          [class]="
            preference() === option.value
              ? 'bg-action text-on-action'
              : 'text-text-muted hover:text-text-primary'
          "
          [attr.aria-pressed]="preference() === option.value"
          [attr.aria-label]="option.label"
          [attr.title]="option.label"
          [attr.data-testid]="'theme-' + option.value"
          (click)="choose(option.value)"
        >
          @switch (option.value) {
            @case ('light') {
              <svg lucideSun [size]="16"></svg>
            }
            @case ('dark') {
              <svg lucideMoon [size]="16"></svg>
            }
            @default {
              <svg lucideMonitor [size]="16"></svg>
            }
          }
        </button>
      }
    </div>
  `,
})
export class ThemeToggleComponent {
  private readonly theme = inject(ThemeService);

  protected readonly preference = this.theme.preference;

  protected readonly options: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: 'Tema claro' },
    { value: 'dark', label: 'Tema escuro' },
    { value: 'system', label: 'Padrão do sistema' },
  ];

  protected choose(preference: ThemePreference): void {
    this.theme.use(preference);
  }
}
