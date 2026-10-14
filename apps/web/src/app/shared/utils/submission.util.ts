import { signal } from '@angular/core';

/**
 * Controle de envio em andamento (issue #497).
 *
 * Um clique repetido, ou um clique com a resposta lenta, não pode virar duas
 * gravações: numa carteira isso é posição em duplicidade e quantidade dobrada,
 * erro de dado financeiro e não incômodo de interface. O `start()` recusa o
 * segundo envio e o `pending` deixa o botão indisponível; o `finish()` libera
 * o próximo, inclusive quando a requisição falha, para o usuário tentar de
 * novo sem refazer o preenchimento.
 */
export class Submission {
  private readonly state = signal(false);

  /** Há um envio em andamento. */
  readonly pending = this.state.asReadonly();

  /** Reserva o envio. `false` quando já existe um em andamento. */
  start(): boolean {
    if (this.state()) return false;

    this.state.set(true);
    return true;
  }

  /** Libera o envio, com sucesso ou falha. */
  finish(): void {
    this.state.set(false);
  }
}
