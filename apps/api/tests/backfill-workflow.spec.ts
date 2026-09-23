import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes do workflow de backfill do histórico mensal de proventos (issue #255)
// O backfill é uma migração one-shot: varre todo o histórico diário para
// popular a coleção mensal. Não pode entrar no pipeline de deploy, que roda a
// cada push na main — ficaria pagando para sempre o custo de leitura que a
// issue #255 existe para eliminar.
// ---------------------------------------------------------------------------

describe('.github/workflows/backfill-dividend-history.yml', () => {
  const workflow = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '.github',
      'workflows',
      'backfill-dividend-history.yml',
    ),
    'utf-8',
  );

  it('deve ser acionado apenas manualmente', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect(workflow).not.toMatch(/^ {2}schedule:/m);
  });

  it('deve permitir limitar a execução a um ticker', () => {
    expect(workflow).toContain('ticker:');
    expect(workflow).toMatch(/required: false/);
  });

  // Migrado junto com o deploy na #322: o secret da chave estática foi
  // removido do repositório, então este workflow precisa da mesma federação
  // para continuar rodando.
  it('deve autenticar por Workload Identity Federation, como o deploy', () => {
    expect(workflow).toContain('google-github-actions/auth');
    expect(workflow).toContain('workload_identity_provider');
    expect(workflow).not.toContain('FIREBASE_SERVICE_ACCOUNT');
  });

  it('deve conceder id-token: write', () => {
    expect(workflow).toMatch(/permissions:[\s\S]*id-token: write/);
  });

  it('deve restringir o GITHUB_TOKEN a contents: read', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('deve executar o script de backfill', () => {
    expect(workflow).toContain(
      'npm run backfill:dividend-history --workspace=apps/api',
    );
  });

  it('deve exigir confirmação do ambiente de produção', () => {
    expect(workflow).toMatch(/environment: production/);
  });
});

describe('.github/workflows/ci-cd.yml – backfill fora do deploy', () => {
  const workflow = readFileSync(
    join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci-cd.yml'),
    'utf-8',
  );

  it('não deve rodar o backfill no pipeline de deploy', () => {
    expect(workflow).not.toContain('backfill:dividend-history');
  });
});
