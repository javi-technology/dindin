import {
  caminhoDaDescricao,
  validarRespostaContraContrato,
} from './openapi-contract';

// ---------------------------------------------------------------------------
// Validador de respostas contra o OpenAPI (issue #499)
//
// O helper é o que faz os testes de rota reprovarem quando o corpo devolvido
// diverge do schema descrito em `openapi/dindin.yaml`. Estes testes cobrem o
// próprio helper: um validador que aceita tudo seria pior que nenhum.
// ---------------------------------------------------------------------------

const resposta = (status: number, body: unknown) => ({ status, body });

describe('validarRespostaContraContrato', () => {
  it('deve aceitar o corpo que respeita o schema da rota', () => {
    const erros = validarRespostaContraContrato(
      resposta(401, { error: 'Não autorizado' }),
      'GET',
      '/api/me',
    );

    expect(erros).toEqual([]);
  });

  it('deve reprovar corpo sem campo obrigatório', () => {
    const erros = validarRespostaContraContrato(
      resposta(401, { code: 'X' }),
      'GET',
      '/api/me',
    );

    expect(erros.join(' ')).toContain('error');
  });

  it('deve reprovar campo com tipo diferente do schema', () => {
    const erros = validarRespostaContraContrato(
      resposta(401, { error: 42 }),
      'GET',
      '/api/me',
    );

    expect(erros).not.toEqual([]);
  });

  it('deve reprovar status que a rota não descreve', () => {
    const erros = validarRespostaContraContrato(
      resposta(418, { error: 'x' }),
      'GET',
      '/api/me',
    );

    expect(erros.join(' ')).toContain('418');
  });

  it.each([401, 413, 426, 429, 500])(
    'deve aceitar o %i dos middlewares como ErrorResponse, sem declaração por rota',
    (status) => {
      expect(
        validarRespostaContraContrato(
          resposta(status, { error: 'Falha' }),
          'POST',
          '/api/wallets',
        ),
      ).toEqual([]);
    },
  );

  it('deve reprovar o status transversal com corpo fora do ErrorResponse', () => {
    const erros = validarRespostaContraContrato(
      resposta(429, { message: 'x' }),
      'POST',
      '/api/wallets',
    );

    expect(erros).not.toEqual([]);
  });

  it('deve reprovar rota fora da descrição', () => {
    const erros = validarRespostaContraContrato(
      resposta(200, {}),
      'GET',
      '/api/inexistente',
    );

    expect(erros.join(' ')).toContain('/api/inexistente');
  });

  it('deve reprovar corpo em resposta que a rota descreve sem corpo', () => {
    const erros = validarRespostaContraContrato(
      resposta(204, { sobrou: true }),
      'POST',
      '/api/me/notification-tokens',
    );

    expect(erros).not.toEqual([]);
  });

  it('deve aceitar resposta sem corpo quando a rota a descreve assim', () => {
    const erros = validarRespostaContraContrato(
      resposta(204, {}),
      'POST',
      '/api/me/notification-tokens',
    );

    expect(erros).toEqual([]);
  });

  it('deve reprovar data fora do formato date-time', () => {
    const erros = validarRespostaContraContrato(
      resposta(201, {
        id: 'w1',
        ownerId: 'u1',
        name: 'Carteira',
        currency: 'BRL',
        createdAt: 'ontem',
        updatedAt: '2026-10-01T10:00:00.000Z',
      }),
      'POST',
      '/api/wallets',
    );

    expect(erros.join(' ')).toContain('createdAt');
  });
});

describe('caminhoDaDescricao', () => {
  it('deve achar o template da rota a partir do caminho real', () => {
    expect(caminhoDaDescricao('GET', '/api/me')).toBe('/api/me');
    expect(caminhoDaDescricao('POST', '/api/wallets')).toBe('/api/wallets');
    expect(
      caminhoDaDescricao('DELETE', '/api/me/notification-tokens/abc'),
    ).toBe('/api/me/notification-tokens/{token}');
  });

  it('deve ignorar a query string', () => {
    expect(caminhoDaDescricao('GET', '/api/me?x=1')).toBe('/api/me');
  });

  it('deve devolver undefined para caminho que a descrição não tem', () => {
    expect(caminhoDaDescricao('GET', '/api/inexistente')).toBeUndefined();
    expect(caminhoDaDescricao('PATCH', '/api/me')).toBeUndefined();
  });
});
