import { Request, Response } from 'express';
import { asyncHandler } from '../../src/middleware/async-handler';

// ---------------------------------------------------------------------------
// Testes do asyncHandler (issue #222)
// Substitui o try/catch → console.error → 500 repetido em 55 pontos dos
// controllers, unificando o formato do log de erro.
// ---------------------------------------------------------------------------

interface MockResponse {
  statusCode: number;
  headersSent: boolean;
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
}

function createResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headersSent: false,
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation(() => {
    res.headersSent = true;
    return res;
  });
  return res;
}

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/wallets/wallet-1',
    params: { id: 'wallet-1' },
    user: { uid: 'user-123' },
    ...overrides,
  } as unknown as Request;
}

describe('asyncHandler', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('deve repassar req e res ao handler quando não há erro', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const req = createRequest();
    const res = createResponse();

    await asyncHandler('getWallet', handler)(req, res as unknown as Response);

    expect(handler).toHaveBeenCalledWith(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('deve responder 500 quando o handler lança', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Firestore caiu'));
    const res = createResponse();

    await asyncHandler('getWallet', handler)(
      createRequest(),
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('deve capturar também erro lançado de forma síncrona', async () => {
    const handler = jest.fn(() => {
      throw new Error('falha síncrona');
    });
    const res = createResponse();

    await asyncHandler('createWallet', handler)(
      createRequest(),
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deve logar em formato único, com nome, rota, uid e params', async () => {
    const error = new Error('Firestore caiu');
    const handler = jest.fn().mockRejectedValue(error);

    await asyncHandler('deleteWallet', handler)(
      createRequest({ method: 'DELETE' } as Partial<Request>),
      createResponse() as unknown as Response,
    );

    expect(errorSpy).toHaveBeenCalledWith('[deleteWallet] error:', {
      method: 'DELETE',
      path: '/api/wallets/wallet-1',
      uid: 'user-123',
      params: { id: 'wallet-1' },
      message: 'Firestore caiu',
      stack: error.stack,
    });
  });

  it('deve logar uid indefinido em rota sem autenticação', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));

    await asyncHandler('handleWebhook', handler)(
      createRequest({ user: undefined } as Partial<Request>),
      createResponse() as unknown as Response,
    );

    expect(errorSpy.mock.calls[0][1]).toMatchObject({ uid: undefined });
  });

  // Um handler pode falhar depois de já ter respondido (ex.: erro ao serializar
  // parte do payload). Escrever um segundo status quebraria a resposta.
  it('não deve responder de novo se o handler já respondeu', async () => {
    const res = createResponse();
    const handler = jest.fn(async (_req: Request, response: Response) => {
      response.json({ ok: true });
      throw new Error('falhou depois de responder');
    });

    await asyncHandler('listWallets', handler)(
      createRequest(),
      res as unknown as Response,
    );

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  // O recommended-wallet.controller anexava `statusCode` ao erro e repetia, em
  // seis handlers, o mapeamento para status + mensagem. O wrapper assume isso.
  describe('erro com statusCode', () => {
    function errorWithStatus(
      message: string,
      statusCode: number,
      extra: Record<string, unknown> = {},
    ): Error {
      return Object.assign(new Error(message), { statusCode, ...extra });
    }

    it('deve responder com o status do erro e a mensagem em 4xx', async () => {
      const handler = jest
        .fn()
        .mockRejectedValue(errorWithStatus('PDF ilegível', 400));
      const res = createResponse();

      await asyncHandler('importRecommended', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'PDF ilegível' });
    });

    it('deve repassar 404 vindo do erro', async () => {
      const handler = jest
        .fn()
        .mockRejectedValue(errorWithStatus('Nenhuma carteira importada', 404));
      const res = createResponse();

      await asyncHandler('getLatestRecommended', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Nenhuma carteira importada',
      });
    });

    // Um statusCode 500 explícito não deve virar canal de vazamento: a
    // mensagem interna continua fora da resposta.
    it('deve manter mensagem genérica quando o statusCode é 500', async () => {
      const handler = jest
        .fn()
        .mockRejectedValue(errorWithStatus('detalhe interno', 500));
      const res = createResponse();

      await asyncHandler('generateSuggestion', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });

    // Em 5xx a mensagem só sai quando a aplicação marcou o erro com
    // `expose: true` (convenção do http-errors). O 502 da ai-suggestion é
    // texto de interface e vem marcado; erros de bibliotecas não.
    it('deve expor a mensagem de 5xx marcado com expose', async () => {
      const handler = jest.fn().mockRejectedValue(
        errorWithStatus('Falha ao consultar o provedor de IA', 502, {
          expose: true,
        }),
      );
      const res = createResponse();

      await asyncHandler('generateSuggestion', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Falha ao consultar o provedor de IA',
      });
    });

    // Os erros do SDK da Stripe trazem statusCode. Antes o billing trocava a
    // mensagem de qualquer 5xx pela genérica; o texto cru da Stripe não pode
    // chegar ao cliente.
    it('não deve expor a mensagem de 5xx sem expose, como os da Stripe', async () => {
      const stripeError = Object.assign(
        new Error('An error occurred with our connection to Stripe.'),
        { type: 'StripeConnectionError', statusCode: 503 },
      );
      const handler = jest.fn().mockRejectedValue(stripeError);
      const res = createResponse();

      await asyncHandler('createCheckoutSession', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });

    it('deve permitir esconder a mensagem de 4xx com expose false', async () => {
      const handler = jest
        .fn()
        .mockRejectedValue(
          errorWithStatus('detalhe sensível', 400, { expose: false }),
        );
      const res = createResponse();

      await asyncHandler('importRecommended', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });

    it('deve ignorar statusCode que não seja número', async () => {
      const handler = jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('boom'), { statusCode: 'quatrocentos' }),
        );
      const res = createResponse();

      await asyncHandler('importRecommended', handler)(
        createRequest(),
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  it('não deve vazar a mensagem do erro na resposta', async () => {
    const handler = jest
      .fn()
      .mockRejectedValue(new Error('senha do banco: s3cr3t'));
    const res = createResponse();

    await asyncHandler('getWallet', handler)(
      createRequest(),
      res as unknown as Response,
    );

    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
