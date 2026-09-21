import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Modal de formulário compartilhado (issue #308).
 *
 * O `confirm-dialog` (#223) resolveu a duplicação só para confirmação: os
 * modais de formulário de carteira, geladeira e administração de usuários
 * continuavam com markup próprio de fundo, caixa, `role="dialog"`, Esc e
 * foco, divergindo entre si.
 *
 * O corpo é projetado com `<ng-content>` porque cada formulário tem campos e
 * botões próprios — parametrizar não faria sentido. Ao contrário do
 * `confirm-dialog`, aqui não há botões de ação: o rodapé pertence ao
 * formulário projetado, que sabe quando o envio é válido.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      O fundo fecha o modal ao clique, que é conveniência de mouse: o
      equivalente de teclado é o Esc, tratado em onKeydown. O fundo é
      decorativo e não deve entrar na ordem de tabulação nem receber foco,
      então as regras abaixo não se aplicam aqui.
    -->
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <div
      class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      data-testid="modal-backdrop"
      (click)="onBackdropClick($event)"
    >
      <div
        #dialog
        class="bg-white rounded-2xl shadow-xl w-full p-6"
        [class]="widthClass()"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.data-testid]="testId()"
        tabindex="-1"
      >
        <div class="flex items-start justify-between gap-4 mb-4">
          <h2 [id]="titleId" class="text-xl font-bold text-gray-900">
            {{ title() }}
          </h2>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Fechar"
            data-testid="modal-close"
            (click)="close()"
          >
            &times;
          </button>
        </div>

        <ng-content />
      </div>
    </div>
  `,
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog =
    viewChild.required<ElementRef<HTMLElement>>('dialog');

  /** Elemento que tinha o foco antes da abertura, para devolvê-lo ao fechar. */
  private previouslyFocused: HTMLElement | null = null;

  readonly title = input.required<string>();
  /** Largura máxima da caixa, no vocabulário do Tailwind. */
  readonly maxWidth = input<'md' | 'lg' | '2xl'>('md');
  /**
   * `data-testid` da caixa. Cada feature mantém o seu, herdado do modal que
   * este componente substituiu, para que os testes de feature continuem
   * apontando para a mesma alça.
   */
  readonly testId = input<string>();

  readonly closed = output<void>();

  private static nextId = 0;

  /** Id estável por instância, para ligar o h2 ao dialog via aria-labelledby. */
  readonly titleId = `modal-title-${ModalComponent.nextId++}`;

  /**
   * As classes ficam literais no código porque o Tailwind varre o fonte em
   * busca de nomes de classe: um `max-w-${...}` montado em tempo de execução
   * não seria encontrado e o CSS não chegaria ao bundle.
   */
  protected widthClass(): string {
    switch (this.maxWidth()) {
      case 'lg':
        return 'max-w-lg';
      case '2xl':
        return 'max-w-2xl';
      default:
        return 'max-w-md';
    }
  }

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this.dialog().nativeElement.focus();
  }

  ngOnDestroy(): void {
    // Devolve o foco ao gatilho: sem isso ele volta para o início da página e
    // quem navega por teclado perde o lugar.
    this.previouslyFocused?.focus?.();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'Tab') this.trapFocus(event);
  }

  /** Mantém o Tab circulando dentro do modal enquanto ele estiver aberto. */
  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (
      event.shiftKey &&
      (active === first || active === this.dialog().nativeElement)
    ) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Só o clique no próprio fundo fecha. Comparar `target` com `currentTarget`
   * evita que um clique dentro da caixa, que sobe por propagação, feche o
   * modal sem querer.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected close(): void {
    this.closed.emit();
  }
}
