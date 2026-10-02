import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Mudança incompatível do OpenAPI (issue #500)
//
// O app instalado só é corrigido por uma nova versão nas lojas. Campo
// renomeado, removido ou com outro tipo quebraria quem ainda roda a versão
// anterior, então o CI compara o contrato com o da branch-base e reprova a
// mudança incompatível que não foi declarada.
// ---------------------------------------------------------------------------

const script = join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'openapi-breaking.mjs',
);
const repoYaml = join(__dirname, '..', '..', '..', 'openapi', 'dindin.yaml');

const base = `
openapi: '3.1.0'
info: { title: T, version: '1' }
paths:
  /api/itens:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Item' }
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NovoItem' }
      responses:
        '201': { description: Criado }
components:
  schemas:
    Tipo:
      type: string
      enum: [A, B]
    Item:
      type: object
      required: [id, nome]
      properties:
        id: { type: string }
        nome: { type: string }
        tipo: { $ref: '#/components/schemas/Tipo' }
        opcional: { type: number }
    NovoItem:
      type: object
      required: [nome]
      properties:
        nome: { type: string }
`;

const executar = (atual: string, referencia = base) => {
  const dir = mkdtempSync(join(tmpdir(), 'openapi-'));
  writeFileSync(join(dir, 'base.yaml'), referencia);
  writeFileSync(join(dir, 'atual.yaml'), atual);
  try {
    const saida = execFileSync(
      'node',
      [script, join(dir, 'base.yaml'), join(dir, 'atual.yaml')],
      { encoding: 'utf-8', stdio: 'pipe' },
    );
    return { codigo: 0, saida };
  } catch (erro: any) {
    return {
      codigo: erro.status as number,
      saida: `${erro.stdout}${erro.stderr}`,
    };
  }
};

describe('openapi-breaking', () => {
  it('deve aceitar contrato igual', () => {
    expect(executar(base).codigo).toBe(0);
  });

  it('deve aceitar campo opcional novo na resposta e rota nova', () => {
    const atual = base
      .replace(
        'opcional: { type: number }',
        'opcional: { type: number }\n        novo: { type: string }',
      )
      .replace(
        'components:',
        `  /api/outra:\n    get:\n      responses:\n        '200': { description: OK }\ncomponents:`,
      );
    expect(executar(atual).codigo).toBe(0);
  });

  it('deve reprovar rota removida', () => {
    const atual = base.replace(
      / {2}\/api\/itens:[\s\S]*?components:/,
      'components:',
    );
    const r = executar(atual);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('GET /api/itens');
  });

  it('deve reprovar campo removido da resposta', () => {
    const r = executar(
      base.replace(
        '        nome: { type: string }\n        tipo',
        '        tipo',
      ),
    );
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('nome');
  });

  it('deve reprovar campo da resposta com outro tipo', () => {
    const r = executar(
      base.replace('opcional: { type: number }', 'opcional: { type: string }'),
    );
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('opcional');
  });

  it('deve reprovar campo da resposta que deixou de ser obrigatório', () => {
    const r = executar(base.replace('required: [id, nome]', 'required: [id]'));
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('nome');
  });

  it('deve reprovar valor novo em enum da resposta', () => {
    const r = executar(base.replace('enum: [A, B]', 'enum: [A, B, C]'));
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('C');
  });

  it('deve reprovar campo obrigatório novo na requisição', () => {
    const atual = base
      .replace('required: [nome]', 'required: [nome, extra]')
      .replace(
        '      properties:\n        nome: { type: string }\n',
        '      properties:\n        nome: { type: string }\n        extra: { type: string }\n',
      );
    const r = executar(atual);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('extra');
  });

  it('deve reprovar status de sucesso removido', () => {
    const r = executar(
      base.replace(
        "'201': { description: Criado }",
        "'200': { description: OK }",
      ),
    );
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('201');
  });

  it('deve aceitar a mudança incompatível declarada em x-incompatible-changes', () => {
    const atual = base
      .replace('required: [id, nome]', 'required: [id]')
      .replace(
        "info: { title: T, version: '1' }",
        "info: { title: T, version: '1' }\nx-incompatible-changes:\n  - 'issue #1: nome deixa de ser obrigatório; app mínimo 2.0.0'",
      );
    const r = executar(atual);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('declarada');
  });

  it('deve reprovar quando a declaração já existia na base', () => {
    const declarada = base.replace(
      "info: { title: T, version: '1' }",
      "info: { title: T, version: '1' }\nx-incompatible-changes:\n  - 'issue #1: antiga'",
    );
    const atual = declarada.replace('required: [id, nome]', 'required: [id]');
    expect(executar(atual, declarada).codigo).toBe(1);
  });

  it('deve aceitar o contrato do repositório contra ele mesmo', () => {
    const yaml = readFileSync(repoYaml, 'utf-8');
    expect(executar(yaml, yaml).codigo).toBe(0);
  });
});
