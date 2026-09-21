import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

// ---------------------------------------------------------------------------
// Testes do modal de formulário compartilhado (issue #308)
//
// O confirm-dialog resolveu a duplicação só para confirmação. Carteira,
// geladeira e administração de usuários continuavam com markup próprio de
// fundo, caixa e acessibilidade em cada modal de formulário.
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <button type="button" data-testid="gatilho">Abrir</button>
    <app-modal
      [title]="'Adicionar item'"
      [testId]="'item-form'"
      (closed)="fechado = fechado + 1"
    >
      <form>
        <label for="ticker">Ticker <strong>obrigatório</strong></label>
        <input id="ticker" />
        <button type="submit" data-testid="salvar">Salvar</button>
      </form>
    </app-modal>
  `,
})
class HostComponent {
  fechado = 0;
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function element(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  function dialog(): HTMLElement {
    return element('[role="dialog"]') as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('conteúdo', () => {
    it('deve exibir o título recebido', () => {
      expect(element('h2')?.textContent).toContain('Adicionar item');
    });

    it('deve projetar o corpo com marcação', () => {
      expect(dialog().querySelector('form')).not.toBeNull();
      expect(dialog().querySelector('strong')?.textContent).toBe('obrigatório');
    });

    it('deve aplicar o data-testid informado na caixa', () => {
      expect(element('[data-testid="item-form"]')).toBe(dialog());
    });
  });

  describe('acessibilidade', () => {
    it('deve marcar o container como dialog modal', () => {
      expect(dialog().getAttribute('role')).toBe('dialog');
      expect(dialog().getAttribute('aria-modal')).toBe('true');
    });

    it('deve associar o título ao dialog via aria-labelledby', () => {
      const labelledBy = dialog().getAttribute('aria-labelledby');

      expect(labelledBy).toBeTruthy();
      expect(element('h2')?.id).toBe(labelledBy as string);
    });

    it('deve mover o foco para o dialog ao abrir', () => {
      expect(document.activeElement).toBe(dialog());
    });

    it('deve devolver o foco ao gatilho ao fechar', () => {
      const gatilho = element('[data-testid="gatilho"]') as HTMLButtonElement;
      gatilho.focus();

      const novo = TestBed.createComponent(HostComponent);
      novo.detectChanges();
      novo.destroy();

      expect(document.activeElement).toBe(gatilho);
    });

    it('deve prender o Tab dentro do modal', () => {
      const salvar = element('[data-testid="salvar"]') as HTMLButtonElement;
      salvar.focus();

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
      fixture.detectChanges();

      expect(dialog().contains(document.activeElement)).toBeTrue();
    });
  });

  describe('fechamento', () => {
    it('deve emitir closed no botão de fechar', () => {
      element('[data-testid="modal-close"]')?.click();

      expect(host.fechado).toBe(1);
    });

    it('deve emitir closed ao pressionar Esc', () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(host.fechado).toBe(1);
    });

    it('deve emitir closed ao clicar no fundo', () => {
      element('[data-testid="modal-backdrop"]')?.click();

      expect(host.fechado).toBe(1);
    });

    // Clicar dentro da caixa não pode fechar: só o fundo fecha.
    it('não deve emitir closed ao clicar dentro do dialog', () => {
      dialog().click();

      expect(host.fechado).toBe(0);
    });
  });
});
