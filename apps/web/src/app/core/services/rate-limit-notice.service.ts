import { Injectable, signal } from '@angular/core';

/**
 * Aviso global de rate limit (issue #505). O limite vale para toda rota
 * `/api/*`, então o 429 pode chegar em qualquer tela; sem um aviso único,
 * cada tela mostraria uma falha genérica ou nenhuma explicação.
 */
@Injectable({ providedIn: 'root' })
export class RateLimitNoticeService {
  /** Segundos de espera pedidos pela API; `null` sem aviso. */
  readonly waitSeconds = signal<number | null>(null);

  private timer: ReturnType<typeof setTimeout> | undefined;

  show(seconds: number): void {
    clearTimeout(this.timer);
    this.waitSeconds.set(seconds);
    this.timer = setTimeout(() => this.dismiss(), seconds * 1000);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.waitSeconds.set(null);
  }
}
