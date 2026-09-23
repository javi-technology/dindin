import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Testes do workflow de CI/CD (issue #145)
// Garante o GITHUB_TOKEN com permissão mínima no workflow (CodeQL
// actions/missing-workflow-permissions) e o npm audit de dependências de
// runtime bloqueando o pipeline e o deploy.
// ---------------------------------------------------------------------------

describe('.github/workflows/ci-cd.yml', () => {
  const workflowPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'ci-cd.yml',
  );
  const workflow = readFileSync(workflowPath, 'utf-8');

  /** Bloco de um job: da sua chave até a próxima chave de job (2 espaços). */
  function jobBlock(name: string): string {
    const match = new RegExp(
      `^  ${name}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`,
      'm',
    ).exec(workflow);
    return match?.[1] ?? '';
  }

  it('deve restringir o GITHUB_TOKEN a contents: read no topo', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('deve ter job audit rodando npm audit de runtime em high', () => {
    const audit = jobBlock('audit');

    expect(audit).toContain('npm audit --audit-level=high --omit=dev');
  });

  it('deve exigir o audit antes do deploy', () => {
    const deploy = jobBlock('deploy');

    expect(deploy).toMatch(/needs:[\s\S]*- audit/);
  });

  // #323: a formatação não era verificada em lugar nenhum e dependia de
  // disciplina manual — já houve arquivo desformatado entrando na develop.
  it('deve verificar a formatação no job lint', () => {
    expect(jobBlock('lint')).toContain('npm run format:check');
  });

  it('deve exigir o lint antes do deploy', () => {
    expect(jobBlock('deploy')).toMatch(/needs:[\s\S]*- lint/);
  });

  it('deve gerar cobertura nos dois jobs de teste', () => {
    expect(jobBlock('build-and-test-api')).toContain('test:coverage');
    expect(jobBlock('build-and-test-web')).toContain('test:coverage');
  });

  it('deve publicar a cobertura dos dois jobs como artefato', () => {
    for (const job of ['build-and-test-api', 'build-and-test-web']) {
      expect(jobBlock(job)).toMatch(/upload-artifact[\s\S]*coverage/);
    }
  });
});
