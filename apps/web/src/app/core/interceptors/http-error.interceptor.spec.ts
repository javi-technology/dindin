import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { httpErrorInterceptor } from './http-error.interceptor';
import { RateLimitNoticeService } from '../services/rate-limit-notice.service';

// ---------------------------------------------------------------------------
// Matriz de erros HTTP (issue #505) — linhas tratadas aqui: sem rede, 429 de
// rate limit, 429 de negócio e 5xx de indisponibilidade. 401 e 403
// SUBSCRIPTION_REQUIRED ficam no unauthorizedInterceptor. O app Flutter
// implementa as mesmas linhas (docs/tratamento-erros-http.md).
// ---------------------------------------------------------------------------

describe('httpErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let notice: RateLimitNoticeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    notice = TestBed.inject(RateLimitNoticeService);
  });

  afterEach(() => httpMock.verify());

  function falha(
    url: string,
    body: unknown,
    init: {
      status: number;
      statusText: string;
      headers?: Record<string, string>;
    },
  ): HttpErrorResponse {
    let erro!: HttpErrorResponse;
    http.get(url).subscribe({ error: (e) => (erro = e) });
    httpMock.expectOne(url).flush(body, init);
    return erro;
  }

  describe('429 de rate limit (code RATE_LIMITED)', () => {
    const limite = {
      error: 'Muitas requisições',
      code: 'RATE_LIMITED',
    };

    it('deve avisar a espera pedida pelo Retry-After, em qualquer tela', () => {
      falha('/api/wallets', limite, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '42' },
      });

      expect(notice.waitSeconds()).toBe(42);
    });

    it('deve assumir um minuto quando a resposta não diz quanto esperar', () => {
      falha('/api/wallets', limite, {
        status: 429,
        statusText: 'Too Many Requests',
      });

      expect(notice.waitSeconds()).toBe(60);
    });

    it('deve trocar a mensagem do erro por um texto em pt-BR com a espera', () => {
      const erro = falha('/api/wallets', limite, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '42' },
      });

      expect(erro.status).toBe(429);
      expect(erro.error).toEqual({
        error: 'Muitas requisições. Aguarde 42 segundos e tente de novo.',
        code: 'RATE_LIMITED',
      });
    });

    it('deve usar o singular quando falta um segundo', () => {
      const erro = falha('/api/wallets', limite, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

      expect(erro.error.error).toContain('1 segundo e');
    });
  });

  it('não deve avisar de rate limit no 429 de negócio, que tem texto próprio', () => {
    const erro = falha(
      '/api/recommended-wallets/bb-fii/suggestions',
      { error: 'Limite diário de sugestões atingido' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    expect(notice.waitSeconds()).toBeNull();
    expect(erro.error.error).toBe('Limite diário de sugestões atingido');
  });

  it('deve explicar a falta de conexão em pt-BR', () => {
    let erro!: HttpErrorResponse;
    http.get('/api/me').subscribe({ error: (e) => (erro = e) });
    httpMock
      .expectOne('/api/me')
      .error(new ProgressEvent('error'), { status: 0 });

    expect(erro.status).toBe(0);
    expect(erro.error).toEqual({
      error: 'Sem conexão com o servidor. Tente de novo.',
    });
  });

  it.each([502, 503, 504])(
    'deve dar mensagem de indisponibilidade ao %i sem texto da API',
    (status) => {
      const erro = falha('/api/me', null, { status, statusText: 'x' });

      expect(erro.error).toEqual({
        error:
          'O serviço está indisponível no momento. Tente de novo em instantes.',
      });
    },
  );

  it('deve manter o texto escrito pela API no 502 (provedor de IA)', () => {
    const erro = falha(
      '/api/recommended-wallets/bb-fii/suggestions',
      { error: 'A IA está indisponível agora' },
      { status: 502, statusText: 'Bad Gateway' },
    );

    expect(erro.error.error).toBe('A IA está indisponível agora');
  });

  it('deve manter o 500 com a mensagem genérica da API', () => {
    const erro = falha(
      '/api/me',
      { error: 'Erro interno do servidor' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(erro.error.error).toBe('Erro interno do servidor');
  });

  it.each([400, 404, 409])('deve repassar o %i sem mexer', (status) => {
    const erro = falha(
      '/api/wallets',
      { error: 'Mensagem da API', code: 'X' },
      { status, statusText: 'x' },
    );

    expect(erro.error).toEqual({ error: 'Mensagem da API', code: 'X' });
  });
});
