import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  AfterViewInit,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Modal de confirmação compartilhado (issue #223).
 *
 * O `CLAUDE.md` proíbe `window.confirm` e exige modal customizado para ação
 * destrutiva. A regra era seguida, mas cada feature reimplementou o seu: o
 * mesmo markup aparecia em quatro templates, divergindo em espaçamento, e
 * nenhum era acessível — sem `role`, sem `aria-modal`, sem Esc e sem controle
 * de foco.
 *
 * O corpo é projetado com `<ng-content>` porque cada uso tem marcação própria
 * (o ticker ou o e-mail em negrito no meio da frase). Parametrizar como texto
 * puro obrigaria a interpolar HTML.
 */
@Component({
  selector: 'app-confirm-dialog',
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
      class="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-50"
      data-testid="confirm-dialog-backdrop"
      (click)="onBackdropClick($event)"
    >
      <div
        #dialog
        class="bg-surface-elevated rounded-2xl shadow-xl w-full max-w-sm p-6"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.data-testid]="testId()"
        tabindex="-1"
      >
        <h2 [id]="titleId" class="text-xl font-bold text-text-primary mb-2">
          {{ title() }}
        </h2>

        <div class="text-text-secondary mb-6">
          <ng-content />
        </div>

        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-sunken"
            data-testid="confirm-dialog-cancel"
            (click)="cancel()"
          >
            {{ cancelLabel() }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            [class]="confirmClasses()"
            [disabled]="confirmDisabled()"
            data-testid="confirm-dialog-confirm"
            (click)="confirm()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog =
    viewChild.required<ElementRef<HTMLElement>>('dialog');

  /** Elemento que tinha o foco antes da abertura, para devolvê-lo ao fechar. */
  private previouslyFocused: HTMLElement | null = null;

  readonly title = input.required<string>();
  readonly confirmLabel = input('Confirmar');
  readonly cancelLabel = input('Cancelar');
  /** `danger` para ação destrutiva; `primary` para confirmação comum. */
  readonly variant = input<'danger' | 'primary'>('danger');
  readonly confirmDisabled = input(false);
  /**
   * `data-testid` da caixa. Cada feature mantém o seu, herdado do modal que
   * este componente substituiu, para que os testes de feature continuem
   * apontando para a mesma alça.
   */
  readonly testId = input<string>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private static nextId = 0;

  /** Id estável por instância, para ligar o h2 ao dialog via aria-labelledby. */
  readonly titleId = `confirm-dialog-title-${ConfirmDialogComponent.nextId++}`;

  protected confirmClasses(): string {
    return this.variant() === 'danger'
      ? 'bg-danger hover:bg-danger-hover text-on-danger'
      : 'bg-action hover:bg-action-hover text-on-action';
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
      this.cancel();
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
      (active === first || active === this.dialogElement())
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

  private dialogElement(): HTMLElement {
    return this.dialog().nativeElement;
  }

  /**
   * Só o clique no próprio fundo fecha. Comparar `target` com `currentTarget`
   * evita que um clique dentro da caixa, que sobe por propagação, feche o
   * modal sem querer — e dispensa um handler de clique só para interrompê-la.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  protected confirm(): void {
    if (this.confirmDisabled()) return;
    this.confirmed.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
