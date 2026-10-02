import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rateLimitMessage } from '../../../core/http/http-errors';
import { RateLimitNoticeService } from '../../../core/services/rate-limit-notice.service';

/**
 * Faixa de aviso do rate limit (issue #505), no topo de qualquer tela. O 429
 * pode chegar em qualquer rota `/api/*`; o aviso diz quanto esperar em vez de
 * deixar uma falha genérica ou nenhuma explicação.
 */
@Component({
  selector: 'app-rate-limit-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notice.waitSeconds(); as seconds) {
      <div
        role="status"
        data-testid="rate-limit-notice"
        class="bg-warning-soft text-warning-ink flex items-center justify-between gap-3 px-6 py-2 text-sm"
      >
        <span>{{ message(seconds) }}</span>
        <button
          type="button"
          data-testid="rate-limit-dismiss"
          class="font-medium underline"
          (click)="notice.dismiss()"
        >
          Fechar
        </button>
      </div>
    }
  `,
})
export class RateLimitNoticeComponent {
  protected readonly notice = inject(RateLimitNoticeService);
  protected readonly message = rateLimitMessage;
}
