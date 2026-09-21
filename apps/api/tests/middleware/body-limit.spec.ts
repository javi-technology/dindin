import request from 'supertest';

const verifyIdTokenMock = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('firebase-admin/firestore', () => ({
  ...jest.requireActual('firebase-admin/firestore'),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: [] }),
        })),
      })),
    })),
  })),
}));

import { app, unhandledErrorHandler } from '../../src/index';

// ---------------------------------------------------------------------------
// Limite de tamanho do corpo por rota (issue #298)
//
// O limite de 10 MB valia para todas as rotas, mas só o import de PDF em
// base64 (rota admin) precisa dele. Com ele em tudo, qualquer usuário
// autenticado podia gravar documentos enormes — quebrando a tela e inflando
// a conta do Firestore.
// ---------------------------------------------------------------------------

describe('limite de corpo das requisições', () => {
  const authHeader = 'Bearer valid-token';

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123', admin: true });
  });

  it('deve recusar corpo acima do limite padrão com 413', async () => {
    const response = await request(app)
      .post('/api/wallets')
      .set('Authorization', authHeader)
      .send({ name: 'a'.repeat(200 * 1024), currency: 'BRL' });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: 'Corpo da requisição muito grande',
    });
  });

  // O PDF da carteira do BB chega em base64 e passa de 100 KB.
  it('deve aceitar corpo grande na rota de import do PDF', async () => {
    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .set('Authorization', authHeader)
      .send({
        fileName: 'invalido.pdf',
        contentBase64: 'A'.repeat(300 * 1024),
      });

    // Passa do limite de tamanho e falha na validação do nome do arquivo.
    expect(response.status).toBe(400);
  });

  // O status final já era 401, mas o corpo era lido antes: o servidor
  // bufferizava e parseava até 10 MB de qualquer anônimo que acertasse a URL
  // do import, sem passar por autenticação nem rate limit (issue #298). Por
  // isso o teste olha a ordem das camadas, e não só a resposta.
  it('deve autenticar antes de qualquer parser de corpo', () => {
    const layers: { name: string }[] = (
      app as unknown as { _router: { stack: { name: string }[] } }
    )._router.stack;
    const names = layers.map((layer) => layer.name);

    const auth = names.indexOf('authMiddleware');
    const firstParser = names.indexOf('jsonParser');

    expect(auth).toBeGreaterThan(-1);
    expect(firstParser).toBeGreaterThan(auth);
  });

  it('deve exigir autenticação antes de ler o corpo do import', async () => {
    const response = await request(app)
      .post('/api/admin/recommended-wallets/bb-fii/import')
      .send({ fileName: 'x.pdf', contentBase64: 'A'.repeat(300 * 1024) });

    expect(response.status).toBe(401);
  });

  it('deve manter /api/health aberto e sem autenticação', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', project: 'dindin' });
  });
});

// ---------------------------------------------------------------------------
// Handler global de erro (issue #298)
//
// A rede de segurança para erros que não nascem dentro de um handler de rota
// respeitava só `err.status`, preenchido pelo body-parser. Um erro que chegue
// com `statusCode` — a convenção do `HttpError` do projeto — virava 500.
// ---------------------------------------------------------------------------

describe('unhandledErrorHandler', () => {
  function createResponse() {
    const res = {
      statusCode: 200,
      status: jest.fn(function (this: unknown, code: number) {
        (res as { statusCode: number }).statusCode = code;
        return res;
      }),
      json: jest.fn(),
    };
    return res;
  }

  const request = {
    method: 'POST',
    path: '/api/wallets',
  } as unknown as Parameters<typeof unhandledErrorHandler>[1];

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve responder 413 para corpo grande', () => {
    const res = createResponse();
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
    });

    unhandledErrorHandler(
      error,
      request,
      res as never,
      (() => undefined) as never,
    );

    expect(res.statusCode).toBe(413);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Corpo da requisição muito grande',
    });
  });

  it('deve respeitar statusCode quando o erro não traz status', () => {
    const res = createResponse();
    const error = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
    });

    unhandledErrorHandler(
      error,
      request,
      res as never,
      (() => undefined) as never,
    );

    expect(res.statusCode).toBe(413);
  });

  it('deve responder 500 genérico para erro sem status', () => {
    const res = createResponse();

    unhandledErrorHandler(
      new Error('Firestore caiu'),
      request,
      res as never,
      (() => undefined) as never,
    );

    expect(res.statusCode).toBe(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Erro interno do servidor',
    });
  });
});
