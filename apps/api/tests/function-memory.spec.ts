const mockOnRequest = jest.fn(() => jest.fn());

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: mockOnRequest,
}));

import '../src/index';

// ---------------------------------------------------------------------------
// Memória da function `api` (issue #453)
//
// A `api` não declarava `memory` e ficava no padrão de 256 MiB do Functions
// v2. Em produção ela estourava o limite por pouco — 17 ocorrências entre
// 22/09 e 29/09/2026, com picos de 256 a 260 MiB. Estourar mata a instância:
// a requisição em voo morre com ela, e numa rota de escrita o usuário vê a
// operação falhar sem saber se o dado foi gravado.
//
// O valor acompanha o das functions que processam o PDF do BB, que já
// declaravam 512MiB. Este teste existe para o limite não sumir de novo num
// refactor do `onRequest`: sem `memory` declarado, o padrão volta calado.
// ---------------------------------------------------------------------------

interface RequestOptions {
  memory?: string;
  secrets?: string[];
  timeoutSeconds?: number;
}

function opcoesDaApi(): RequestOptions {
  const call = mockOnRequest.mock.calls[0];
  if (!call) throw new Error('A function `api` não foi registrada.');
  return call[0] as RequestOptions;
}

describe('function api', () => {
  it('deve declarar o limite de memória', () => {
    expect(opcoesDaApi().memory).toBeDefined();
  });

  it('deve usar 512MiB, como as demais functions do projeto', () => {
    expect(opcoesDaApi().memory).toBe('512MiB');
  });
});
