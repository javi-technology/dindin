import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  APP_UPDATE_REQUIRED,
  APP_VERSION_HEADER,
  compareVersions,
  minAppVersion,
  requireMinAppVersion,
} from '../../src/middleware/app-version.middleware';

// ---------------------------------------------------------------------------
// Versão mínima do app aceita pela API (issue #500)
//
// O app fica instalado no aparelho e continua rodando depois de um deploy da
// API; o web atualiza junto com o Hosting. Sem uma versão mínima, uma mudança
// incompatível só poderia ser corrigida por uma nova versão publicada nas
// lojas, com o app antigo quebrado até lá.
// ---------------------------------------------------------------------------

const montar = (minima: string) => {
  const app = express();
  app.use(
    '/api/*splat',
    requireMinAppVersion(() => minima),
  );
  app.get('/api/algo', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
};

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.2.0', '1.1.9', 1],
    ['1.0.9', '1.1.0', -1],
    ['2.0.0', '1.99.99', 1],
    ['1.10.0', '1.9.0', 1],
  ])('compara %s com %s', (a, b, esperado) => {
    expect(Math.sign(compareVersions(a, b) as number)).toBe(esperado);
  });

  it('ignora o sufixo de build e de pré-release', () => {
    expect(compareVersions('1.2.0+7', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0-rc.1', '1.2.0')).toBe(0);
  });

  it('devolve undefined para versão que não é X.Y.Z', () => {
    expect(compareVersions('abc', '1.0.0')).toBeUndefined();
    expect(compareVersions('1.0', '1.0.0')).toBeUndefined();
  });
});

describe('requireMinAppVersion', () => {
  it('deve recusar com 426 e código de contrato abaixo da mínima', async () => {
    const response = await request(montar('2.0.0'))
      .get('/api/algo')
      .set(APP_VERSION_HEADER, '1.9.9');

    expect(response.status).toBe(426);
    expect(response.body.code).toBe(APP_UPDATE_REQUIRED);
    expect(response.body.error).toMatch(/atualiz/i);
  });

  it('deve aceitar a versão igual à mínima', async () => {
    const response = await request(montar('2.0.0'))
      .get('/api/algo')
      .set(APP_VERSION_HEADER, '2.0.0');

    expect(response.status).toBe(200);
  });

  it('deve aceitar versão acima da mínima, com sufixo de build', async () => {
    const response = await request(montar('2.0.0'))
      .get('/api/algo')
      .set(APP_VERSION_HEADER, '2.1.0+15');

    expect(response.status).toBe(200);
  });

  it('deve aceitar quem não informa a versão (web e apps anteriores à política)', async () => {
    const response = await request(montar('2.0.0')).get('/api/algo');

    expect(response.status).toBe(200);
  });

  it('deve aceitar versão ilegível em vez de bloquear por engano', async () => {
    const response = await request(montar('2.0.0'))
      .get('/api/algo')
      .set(APP_VERSION_HEADER, 'beta');

    expect(response.status).toBe(200);
  });
});

describe('minAppVersion', () => {
  const original = process.env.APP_MIN_VERSION;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_MIN_VERSION;
    else process.env.APP_MIN_VERSION = original;
  });

  it('deve usar a variável de ambiente quando válida', () => {
    process.env.APP_MIN_VERSION = '3.4.5';
    expect(minAppVersion()).toBe('3.4.5');
  });

  it('deve cair no padrão quando a variável é inválida', () => {
    process.env.APP_MIN_VERSION = 'x';
    expect(minAppVersion()).toBe('1.0.0');
  });

  it('deve usar o padrão sem variável', () => {
    delete process.env.APP_MIN_VERSION;
    expect(minAppVersion()).toBe('1.0.0');
  });
});
