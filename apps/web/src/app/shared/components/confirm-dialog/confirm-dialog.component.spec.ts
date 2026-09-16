import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';

// ---------------------------------------------------------------------------
// Testes do modal de confirmação compartilhado (issue #223)
//
// O markup de modal estava duplicado em quatro features, cada uma com o seu
// espaçamento, e nenhuma acessível: sem role, sem aria-modal, sem Esc e sem
// controle de foco.
// ---------------------------------------------------------------------------

@Component({
  standalone: true,
  imports: [ConfirmDialogComponent],
  template: `
    <button type="button" data-testid="gatilho">Abrir</button>
    <app-confirm-dialog
      [title]="'Confirmar exclusão'"
      [confirmLabel]="'Remover'"
      [variant]="variant"
      [confirmDisabled]="confirmDisabled"
      (confirmed)="confirmado = confirmado + 1"
      (cancelled)="cancelado = cancelado + 1"
    >
      Tem certeza que deseja remover <strong>HGLG11</strong> da carteira?
    </app-confirm-dialog>
  `,
})
class HostComponent {
  variant: 'danger' | 'primary' = 'danger';
  confirmDisabled = false;
  confirmado = 0;
  cancelado = 0;
}

describe('ConfirmDialogComponent', () => {
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
      expect(element('h2')?.textContent).toContain('Confirmar exclusão');
    });

    it('deve projetar o corpo com marcação', () => {
      expect(dialog().textContent).toContain('Tem certeza que deseja remover');
      expect(dialog().querySelector('strong')?.textContent).toBe('HGLG11');
    });

    it('deve usar os rótulos informados', () => {
      expect(
        element('[data-testid="confirm-dialog-confirm"]')?.textContent?.trim(),
      ).toBe('Remover');
      expect(
        element('[data-testid="confirm-dialog-cancel"]')?.textContent?.trim(),
      ).toBe('Cancelar');
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
  });

  describe('ações', () => {
    it('deve emitir confirmed no botão de confirmação', () => {
      element('[data-testid="confirm-dialog-confirm"]')?.click();

      expect(host.confirmado).toBe(1);
      expect(host.cancelado).toBe(0);
    });

    it('deve emitir cancelled no botão de cancelar', () => {
      element('[data-testid="confirm-dialog-cancel"]')?.click();

      expect(host.cancelado).toBe(1);
      expect(host.confirmado).toBe(0);
    });

    it('deve emitir cancelled ao pressionar Esc', () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(host.cancelado).toBe(1);
    });

    it('deve emitir cancelled ao clicar no fundo', () => {
      element('[data-testid="confirm-dialog-backdrop"]')?.click();

      expect(host.cancelado).toBe(1);
    });

    // Clicar dentro da caixa não pode fechar: só o fundo fecha.
    it('não deve emitir cancelled ao clicar dentro do dialog', () => {
      dialog().click();

      expect(host.cancelado).toBe(0);
    });

    it('não deve emitir confirmed com o botão desabilitado', () => {
      host.confirmDisabled = true;
      fixture.detectChanges();

      element('[data-testid="confirm-dialog-confirm"]')?.click();

      expect(host.confirmado).toBe(0);
    });
  });

  describe('variante', () => {
    it('deve usar vermelho na variante destrutiva', () => {
      const confirm = element('[data-testid="confirm-dialog-confirm"]');

      expect(confirm?.className).toContain('bg-red-600');
    });

    it('deve usar verde na variante primária', () => {
      host.variant = 'primary';
      fixture.detectChanges();

      const confirm = element('[data-testid="confirm-dialog-confirm"]');

      expect(confirm?.className).toContain('bg-green-600');
    });
  });
});
