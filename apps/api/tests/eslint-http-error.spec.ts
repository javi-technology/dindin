import { ESLint } from 'eslint';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Regra contra `res.status(4xx).json` nos controllers (issue #508)
//
// O AGENTS.md manda sinalizar falha de negócio com `HttpError`, traduzido pelo
// `asyncHandler`. Cerca de 100 pontos ainda respondiam direto, deixando o
// `code`, o `expose` e o log a cargo de cada controller. Esta regra impede a
// volta do padrão antigo; só middlewares (que não passam pelo `asyncHandler`)
// podem responder 4xx direto.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

async function mensagens(arquivo: string, codigo: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: repoRoot });
  const [resultado] = await eslint.lintText(codigo, {
    filePath: join(repoRoot, arquivo),
  });
  return resultado.messages
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const CONTROLLER = 'apps/api/src/wallet/exemplo.controller.ts';

describe('no-restricted-syntax: res.status(4xx).json', () => {
  it.each([400, 401, 403, 404, 409, 429])(
    'deve reprovar res.status(%i).json no controller',
    async (status) => {
      const erros = await mensagens(
        CONTROLLER,
        `export function h(res: any) { res.status(${status}).json({ error: 'x' }); }`,
      );

      expect(erros.join(' ')).toContain('HttpError');
    },
  );

  it('deve reprovar a cadeia em várias linhas', async () => {
    const erros = await mensagens(
      CONTROLLER,
      `export function h(res: any) {\n  res\n    .status(404)\n    .json({ error: 'x' });\n}`,
    );

    expect(erros.join(' ')).toContain('HttpError');
  });

  it.each([200, 201, 500, 502])(
    'deve permitir res.status(%i).json',
    async (status) => {
      const erros = await mensagens(
        CONTROLLER,
        `export function h(res: any) { res.status(${status}).json({ ok: true }); }`,
      );

      expect(erros).toEqual([]);
    },
  );

  it('deve permitir nos middlewares, que não passam pelo asyncHandler', async () => {
    const erros = await mensagens(
      'apps/api/src/middleware/exemplo.middleware.ts',
      `export function h(res: any) { res.status(401).json({ error: 'x' }); }`,
    );

    expect(erros).toEqual([]);
  });

  it('deve valer para o código real: nenhum controller responde 4xx direto', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const resultados = await eslint.lintFiles(['apps/api/src/**/*.ts']);
    const violacoes = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === 'no-restricted-syntax')
        .map((m) => `${r.filePath}:${m.line}`),
    );

    expect(violacoes).toEqual([]);
  });
});
