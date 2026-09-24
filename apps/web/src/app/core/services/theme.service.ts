import { Injectable, computed, signal } from '@angular/core';

/** Escolha do usuário: um tema fixo ou seguir o sistema operacional. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Tema de fato aplicado, depois de resolver o `system`. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'dindin-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Tema da interface (issue #394).
 *
 * O padrão é a preferência do sistema operacional; a escolha explícita do
 * usuário fica no `localStorage` e vence o sistema. `system` não guarda nada:
 * a ausência de valor é o que significa "siga o sistema", e por isso voltar
 * ao padrão apaga a chave em vez de gravar 'system'.
 *
 * O `index.html` aplica o mesmo cálculo antes da primeira pintura, para a tela
 * não piscar clara antes do Angular subir. Aqui o valor é reaplicado porque a
 * escolha pode mudar durante a sessão.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly preferenceSignal = signal<ThemePreference>(this.stored());
  private readonly systemPrefersDark = signal(this.queryPrefersDark());

  readonly preference = this.preferenceSignal.asReadonly();

  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preferenceSignal();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    this.watchSystem();
    this.apply();
  }

  /** Registra a escolha do usuário e aplica o tema na hora. */
  use(preference: ThemePreference): void {
    this.preferenceSignal.set(preference);
    try {
      if (preference === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // Navegação privada pode recusar a escrita: o tema desta sessão continua
      // valendo, só não sobrevive ao recarregamento.
    }
    this.apply();
  }

  private stored(): ThemePreference {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }

  private queryPrefersDark(): boolean {
    return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
  }

  private watchSystem(): void {
    if (typeof matchMedia !== 'function') {
      return;
    }
    matchMedia(DARK_QUERY).addEventListener('change', (event) => {
      this.systemPrefersDark.set(event.matches);
      this.apply();
    });
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.resolved());
  }
}
