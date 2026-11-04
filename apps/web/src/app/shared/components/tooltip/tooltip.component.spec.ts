import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TooltipComponent } from './tooltip.component';

// ---------------------------------------------------------------------------
// Testes do tooltip de botão só com ícone (issue #591)
//
// O jsdom não calcula layout: o retângulo do botão é simulado, e o que se
// confere é a posição pedida ao navegador, em relação à janela.
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [TooltipComponent],
  template: `
    <app-tooltip text="Editar">
      <button aria-label="Editar" data-testid="alvo"></button>
    </app-tooltip>
  `,
})
class HostComponent {}

describe('TooltipComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement;
  const tooltip = () => el().querySelector<HTMLElement>('[role="tooltip"]');
  const host = () => el().querySelector('app-tooltip') as HTMLElement;
  const botao = () =>
    el().querySelector('[data-testid="alvo"]') as HTMLButtonElement;

  function simularBotaoEm(top: number, right: number, bottom: number): void {
    vi.spyOn(host(), 'getBoundingClientRect').mockReturnValue({
      top,
      right,
      bottom,
    } as DOMRect);
  }

  function disparar(alvo: EventTarget, tipo: string): void {
    alvo.dispatchEvent(new Event(tipo, { bubbles: true }));
    fixture.detectChanges();
  }

  /** Foco de teclado: o foco por clique do mouse não casa com :focus-visible. */
  function focarPeloTeclado(visivel = true): void {
    vi.spyOn(botao(), 'matches').mockReturnValue(visivel);
    disparar(botao(), 'focusin');
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    simularBotaoEm(300, 500, 332);
  });

  afterEach(() => vi.restoreAllMocks());

  it('não deve mostrar nada antes da interação', () => {
    expect(tooltip()).toBeNull();
  });

  it('deve mostrar o texto ao passar o mouse e esconder ao sair', () => {
    disparar(host(), 'mouseenter');
    expect(tooltip()?.textContent?.trim()).toBe('Editar');

    disparar(host(), 'mouseleave');
    expect(tooltip()).toBeNull();
  });

  it('deve mostrar no foco do teclado e esconder ao perder o foco', () => {
    focarPeloTeclado();
    expect(tooltip()?.textContent?.trim()).toBe('Editar');

    disparar(botao(), 'focusout');
    expect(tooltip()).toBeNull();
  });

  // Fechar um modal devolve o foco ao botão clicado: sem esta distinção, o
  // tooltip reapareceria sozinho para quem usa o mouse.
  it('não deve mostrar no foco causado pelo mouse', () => {
    focarPeloTeclado(false);

    expect(tooltip()).toBeNull();
  });

  it('deve continuar aberto ao sair o mouse enquanto há foco de teclado', () => {
    focarPeloTeclado();
    disparar(host(), 'mouseenter');
    disparar(host(), 'mouseleave');

    expect(tooltip()).not.toBeNull();
  });

  it('deve continuar aberto ao perder o foco com o mouse em cima', () => {
    focarPeloTeclado();
    disparar(host(), 'mouseenter');
    disparar(botao(), 'focusout');

    expect(tooltip()).not.toBeNull();
  });

  // A ação abre um modal ou remove a linha: o rótulo já cumpriu seu papel.
  it('deve esconder ao clicar no botão', () => {
    disparar(host(), 'mouseenter');

    botao().click();
    fixture.detectChanges();

    expect(tooltip()).toBeNull();
  });

  // O contêiner da tabela tem overflow e cortaria um tooltip `absolute`.
  describe('posição', () => {
    it('deve usar fixed, para não ser cortado pelo contêiner da tabela', () => {
      disparar(host(), 'mouseenter');

      expect(tooltip()?.classList).toContain('fixed');
    });

    it('deve ficar acima do botão, alinhado à borda direita dele', () => {
      const janela = document.documentElement;
      vi.spyOn(janela, 'clientWidth', 'get').mockReturnValue(1000);
      vi.spyOn(janela, 'clientHeight', 'get').mockReturnValue(800);

      disparar(host(), 'mouseenter');

      expect(tooltip()?.style.right).toBe('500px');
      expect(tooltip()?.style.bottom).toBe('504px');
      expect(tooltip()?.style.top).toBe('');
    });

    it('deve ir para baixo do botão quando não couber acima', () => {
      simularBotaoEm(10, 500, 42);

      disparar(host(), 'mouseenter');

      expect(tooltip()?.style.top).toBe('46px');
      expect(tooltip()?.style.bottom).toBe('');
    });
  });

  // A posição é calculada ao abrir e ficaria defasada; Esc atende à WCAG 1.4.13.
  describe('fechamento', () => {
    it('deve esconder ao rolar, inclusive um contêiner interno', () => {
      disparar(host(), 'mouseenter');

      el().dispatchEvent(new Event('scroll'));
      fixture.detectChanges();

      expect(tooltip()).toBeNull();
    });

    it('deve esconder ao redimensionar a janela', () => {
      disparar(host(), 'mouseenter');

      disparar(window, 'resize');

      expect(tooltip()).toBeNull();
    });

    it('deve esconder com Esc, mas não com outra tecla', () => {
      disparar(host(), 'mouseenter');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      fixture.detectChanges();
      expect(tooltip()).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(tooltip()).toBeNull();
    });

    it('deve voltar a abrir depois de fechado', () => {
      disparar(host(), 'mouseenter');
      disparar(window, 'resize');
      disparar(host(), 'mouseleave');

      disparar(host(), 'mouseenter');

      expect(tooltip()).not.toBeNull();
    });
  });
});
