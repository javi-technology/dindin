import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService, THEME_STORAGE_KEY } from './theme.service';

/*
  O tema (issue #394) é escolha do usuário sobre a preferência do sistema, e
  precisa sobreviver a um recarregamento. Os testes rodam browserless: a
  preferência do sistema é um `matchMedia` de mentira, e o que se verifica é o
  atributo que o serviço escreve no `<html>`.
*/
type MediaListener = (event: { matches: boolean }) => void;

function stubSystemPreference(prefersDark: boolean): {
  emit: (matches: boolean) => void;
} {
  const listeners: MediaListener[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      addEventListener: (_type: string, listener: MediaListener) =>
        listeners.push(listener),
      removeEventListener: (_type: string, listener: MediaListener) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    })),
  );
  return {
    emit: (matches: boolean) =>
      listeners.forEach((listener) => listener({ matches })),
  };
}

function createService(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [ThemeService] });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('deve seguir a preferência do sistema na primeira visita', () => {
    stubSystemPreference(true);

    const service = createService();

    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('deve usar o tema claro quando o sistema não pede escuro', () => {
    stubSystemPreference(false);

    const service = createService();

    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('deve preservar a escolha do usuário entre sessões', () => {
    stubSystemPreference(true);
    createService().use('light');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    const outraSessao = createService();

    expect(outraSessao.preference()).toBe('light');
    expect(outraSessao.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('deve voltar a seguir o sistema quando o usuário escolhe o padrão', () => {
    stubSystemPreference(true);
    const service = createService();

    service.use('light');
    service.use('system');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(service.resolved()).toBe('dark');
  });

  it('deve acompanhar a troca de tema do sistema enquanto segue o padrão', () => {
    const media = stubSystemPreference(false);
    const service = createService();

    media.emit(true);

    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('deve ignorar a troca do sistema quando há escolha do usuário', () => {
    const media = stubSystemPreference(false);
    const service = createService();
    service.use('light');

    media.emit(true);

    expect(service.resolved()).toBe('light');
  });

  it('deve ignorar valor inválido guardado no navegador', () => {
    stubSystemPreference(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');

    const service = createService();

    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('dark');
  });
});
