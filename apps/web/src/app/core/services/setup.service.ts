import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import {
  DefaultResource,
  SetupRequest,
  SetupResponse,
} from 'dindin-shared-types';

/**
 * Carteira Principal e Geladeira Principal criadas pela API (#275). Os nomes
 * padrão moram lá; o front só diz quando provisionar.
 */
@Injectable({
  providedIn: 'root',
})
export class SetupService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/me/setup';
  private session: { uid: string; done: Promise<void> } | null = null;

  /**
   * Provisiona uma vez por sessão do usuário, antes das telas que dependem de
   * carteira ou geladeira. Nunca rejeita: a falha é logada e o estado vazio
   * das telas continua como fallback.
   */
  ensureDefaults(uid: string): Promise<void> {
    if (this.session?.uid !== uid) {
      const body: SetupRequest = {};
      const done = firstValueFrom(
        this.http.post<SetupResponse>(this.apiUrl, body),
      ).then(
        () => undefined,
        (error) =>
          console.error(
            '[SetupService] falha ao provisionar carteira e geladeira padrão',
            error,
          ),
      );
      this.session = { uid, done };
    }
    return this.session.done;
  }

  /** Pedido explícito do botão de fallback, para quem apagou tudo. */
  createDefault(resource: DefaultResource): Observable<SetupResponse> {
    const body: SetupRequest = { resource };
    return this.http.post<SetupResponse>(this.apiUrl, body);
  }
}
