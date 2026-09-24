import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggleComponent } from './theme-toggle.component';
import {
  ThemeService,
  ThemePreference,
} from '../../../core/services/theme.service';

class ThemeServiceFake {
  preference = vi.fn(() => 'system' as ThemePreference);
  resolved = vi.fn(() => 'light' as 'light' | 'dark');
  use = vi.fn();
}

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let theme: ThemeServiceFake;

  beforeEach(async () => {
    theme = new ThemeServiceFake();
    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
      providers: [{ provide: ThemeService, useValue: theme }],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();
  });

  function button(preference: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(
      `[data-testid="theme-${preference}"]`,
    );
  }

  it('deve oferecer claro, escuro e padrão do sistema', () => {
    for (const preference of ['light', 'dark', 'system']) {
      expect(button(preference)).toBeTruthy();
    }
  });

  it('deve informar a escolha ao serviço de tema', () => {
    button('dark')?.click();

    expect(theme.use).toHaveBeenCalledWith('dark');
  });

  it('deve marcar a opção em uso para leitor de tela', () => {
    theme.preference.mockReturnValue('system');
    fixture.detectChanges();

    expect(button('system')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('dark')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('deve ter nome acessível no grupo de botões', () => {
    const group = fixture.nativeElement.querySelector('[role="group"]');

    expect(group?.getAttribute('aria-label')).toContain('ema');
  });
});
