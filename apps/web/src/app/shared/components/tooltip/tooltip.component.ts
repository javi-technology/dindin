import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, merge, Subscription, take } from 'rxjs';

/** Distância entre o botão e o tooltip, em px. */
const DISTANCIA = 4;
/** Espaço acima do botão abaixo do qual o tooltip passa para baixo dele. */
const ESPACO_MINIMO_ACIMA = 32;

interface Posicao {
  right: number;
  top: number | null;
  bottom: number | null;
}

/**
 * Rótulo de um botão só com ícone (issue #591). Aparece no hover e no foco do
 * teclado; o nome acessível continua sendo o `aria-label` do botão projetado.
 *
 * Usa `fixed` porque as tabelas ficam em `overflow-x-auto`, que também corta na
 * vertical: um tooltip `absolute` sumiria na última linha. Ancorar pela direita
 * o mantém dentro da janela na última coluna, sem precisar medir o texto.
 */
@Component({
  selector: 'app-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex',
    '(mouseenter)': 'aoEntrarMouse()',
    '(mouseleave)': 'aoSairMouse()',
    '(focusin)': 'aoFocar($event)',
    '(focusout)': 'aoDesfocar()',
    '(click)': 'fechar()',
  },
  template: `
    <ng-content />
    @if (posicao(); as p) {
      <span
        role="tooltip"
        class="pointer-events-none fixed z-40 rounded-md bg-text-primary px-2 py-1 text-xs font-normal text-surface shadow-lg"
        [style.right.px]="p.right"
        [style.top.px]="p.top"
        [style.bottom.px]="p.bottom"
        >{{ text() }}</span
      >
    }
  `,
})
export class TooltipComponent {
  readonly text = input.required<string>();

  protected readonly posicao = signal<Posicao | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private comMouse = false;
  private comFoco = false;
  private gatilhosDeFechamento?: Subscription;

  protected aoEntrarMouse(): void {
    this.comMouse = true;
    this.abrir();
  }

  protected aoSairMouse(): void {
    this.comMouse = false;
    if (!this.comFoco) this.fechar();
  }

  /**
   * Só o foco de teclado abre: fechar um modal devolve o foco ao botão clicado,
   * e o tooltip reapareceria sozinho para quem usa o mouse.
   */
  protected aoFocar(event: Event): void {
    if (!(event.target as Element).matches(':focus-visible')) return;
    this.comFoco = true;
    this.abrir();
  }

  protected aoDesfocar(): void {
    this.comFoco = false;
    if (!this.comMouse) this.fechar();
  }

  protected fechar(): void {
    this.comMouse = false;
    this.comFoco = false;
    this.gatilhosDeFechamento?.unsubscribe();
    this.posicao.set(null);
  }

  private abrir(): void {
    if (this.posicao()) return;

    const botao = this.host.nativeElement.getBoundingClientRect();
    const janela = document.documentElement;
    const cabeAcima = botao.top >= ESPACO_MINIMO_ACIMA;
    this.posicao.set({
      right: janela.clientWidth - botao.right,
      top: cabeAcima ? null : botao.bottom + DISTANCIA,
      bottom: cabeAcima ? janela.clientHeight - botao.top + DISTANCIA : null,
    });

    // A posição é calculada ao abrir e ficaria defasada ao rolar. O `capture`
    // alcança a rolagem do contêiner da tabela, que não propaga até a janela.
    this.gatilhosDeFechamento = merge(
      fromEvent(window, 'scroll', { capture: true, passive: true }),
      fromEvent(window, 'resize'),
      fromEvent<KeyboardEvent>(document, 'keydown').pipe(
        filter((event) => event.key === 'Escape'),
      ),
    )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.fechar());
  }
}
