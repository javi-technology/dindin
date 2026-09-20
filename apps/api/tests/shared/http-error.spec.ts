import { HttpError } from '../../src/shared/http-error';

// ---------------------------------------------------------------------------
// Erro HTTP tipado (issue #304)
//
// O `asyncHandler` já lia `statusCode` e `expose` (issue #222), mas não havia
// uma classe representando a convenção: `type StatusError` e `createError`
// estavam redefinidos em quatro arquivos, cada um com suas regras, e dois
// pontos montavam o erro inline.
// ---------------------------------------------------------------------------

describe('shared/http-error', () => {
  it('deve carregar mensagem e status', () => {
    const error = new HttpError('Carteira não encontrada', 404);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Carteira não encontrada');
    expect(error.statusCode).toBe(404);
  });

  // Mesma convenção do `asyncHandler`: 4xx é texto escrito para o usuário,
  // 5xx é detalhe interno que não deve vazar.
  it('deve expor 4xx e esconder 5xx por padrão', () => {
    expect(new HttpError('Ticker inválido', 400).expose).toBe(true);
    expect(new HttpError('Falha ao gravar', 500).expose).toBe(false);
  });

  it('deve permitir expor um 5xx escrito para a tela', () => {
    const error = new HttpError('Falha ao consultar o provedor de IA', 502, {
      expose: true,
    });

    expect(error.expose).toBe(true);
  });

  describe('fábricas', () => {
    it.each([
      ['badRequest', 400, true],
      ['notFound', 404, true],
      ['conflict', 409, true],
      ['tooManyRequests', 429, true],
      ['internal', 500, false],
    ] as const)('%s deve criar %i', (factory, statusCode, expose) => {
      const error = HttpError[factory]('mensagem');

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(statusCode);
      expect(error.expose).toBe(expose);
      expect(error.message).toBe('mensagem');
    });

    // A mensagem do 502 é texto de interface ("não foi possível consultar a
    // IA agora"), diferente dos outros 5xx.
    it('badGateway deve expor a mensagem', () => {
      const error = HttpError.badGateway('Falha ao consultar o provedor de IA');

      expect(error.statusCode).toBe(502);
      expect(error.expose).toBe(true);
    });
  });

  it('deve preservar o stack trace da origem', () => {
    const error = HttpError.notFound('Sugestão não encontrada');

    expect(error.stack).toContain('http-error.spec.ts');
  });
});
