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

  // #500: o app instalado só é corrigido por uma nova versão nas lojas; o
  // contrato não pode mudar de forma incompatível sem aviso explícito.
  it('deve reprovar no job lint a mudança incompatível do OpenAPI em PR', () => {
    const lint = jobBlock('lint');

    expect(lint).toContain('scripts/openapi-breaking.mjs');
    expect(lint).toMatch(/if: github\.event_name == 'pull_request'/);
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

  // #321: regras e índices eram publicados à mão, então produção podia
  // divergir do que está versionado e testado. O índice de collectionGroup de
  // `dividends` é obrigatório para o registro automático de proventos, e as
  // regras são a barreira de segurança do banco.
  it('deve publicar regras e índices do Firestore e do Storage', () => {
    const deploy = jobBlock('deploy');

    for (const alvo of ['firestore:rules', 'firestore:indexes', 'storage']) {
      expect(deploy).toContain(alvo);
    }
  });

  // `--force` faz o firebase-tools apagar, sem perguntar, índices que existem
  // no projeto e não estão no `firestore.indexes.json` — um índice criado pelo
  // link de erro do console sumiria no deploy seguinte, derrubando a consulta
  // que dependia dele. Sem a flag e em modo não interativo, o CLI apenas
  // avisa e mantém.
  it('não deve usar --force ao publicar regras e índices', () => {
    const passo = /firebase deploy --only [^\n]*firestore:indexes[^\n]*/.exec(
      jobBlock('deploy'),
    );

    expect(passo).not.toBeNull();
    expect(passo![0]).not.toContain('--force');
  });

  // O deploy só pode publicar regras depois que os testes de regras passarem,
  // e eles rodam no job da API.
  it('deve exigir os testes da API antes do deploy', () => {
    expect(jobBlock('deploy')).toMatch(/needs:[\s\S]*- build-and-test-api/);
  });

  // #458: o `version` calcula a versão que o deploy exige, e é o primeiro
  // job da cadeia. O mobile é o segundo mais lento do pipeline: rodá-lo antes
  // de saber se a versão fecha gasta o minuto mais caro do CI à toa — e no
  // grafo do Actions ele aparecia solto, fora da cadeia que os demais builds
  // já seguiam.
  it.each([
    'build-and-test-api',
    'build-and-test-web',
    'build-and-test-mobile',
  ])('deve calcular a versão antes de %s', (job) => {
    expect(jobBlock(job)).toMatch(/needs:[\s\S]*version/);
  });

  // #322: a chave JSON de longa duração no secret dá acesso ao projeto até
  // ser revogada à mão. O Workload Identity Federation troca por um token
  // efêmero, emitido pelo próprio GitHub e trocado no GCP.
  it('deve autenticar por Workload Identity Federation, sem chave estática', () => {
    const deploy = jobBlock('deploy');

    expect(deploy).toContain('workload_identity_provider');
    expect(deploy).toContain('service_account');
    expect(deploy).not.toContain('credentials_json');
  });

  // O token OIDC só é emitido para o job se a permissão estiver declarada.
  it('deve conceder id-token: write ao job de deploy', () => {
    expect(jobBlock('deploy')).toMatch(/permissions:[\s\S]*id-token: write/);
  });

  it('não deve mais referenciar o secret da service account', () => {
    expect(workflow).not.toContain('FIREBASE_SERVICE_ACCOUNT');
  });
});

// O `npm audit` do CI reprovou por `@grpc/grpc-js <=1.13.5` (issue #487): o
// `@firebase/firestore` do app web o fixa em `~1.9.0`, e o `firebase` já estava
// na última versão, então só um `override` resolve. A auditoria roda na rede e
// só acusa depois de o alerta sair; este teste confere o lockfile e acusa na
// suíte, sem rede, se uma cópia na faixa vulnerável voltar.
describe('package-lock.json', () => {
  const lock = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'package-lock.json'),
      'utf-8',
    ),
  ) as { packages: Record<string, { version?: string }> };

  const VULNERAVEL_ATE = [1, 13, 5];

  const aoMenosTaoAntigaQue = (versao: string, limite: number[]): boolean => {
    const partes = versao.split('-')[0].split('.').map(Number);
    for (let i = 0; i < limite.length; i++) {
      if (partes[i] !== limite[i]) return partes[i] < limite[i];
    }
    return true;
  };

  it('não deve resolver @grpc/grpc-js na faixa vulnerável (<=1.13.5)', () => {
    const vulneraveis = Object.entries(lock.packages)
      .filter(([caminho]) => caminho.endsWith('node_modules/@grpc/grpc-js'))
      .filter(([, pacote]) =>
        aoMenosTaoAntigaQue(pacote.version ?? '0.0.0', VULNERAVEL_ATE),
      )
      .map(([caminho, pacote]) => `${caminho}@${pacote.version}`);

    expect(vulneraveis).toEqual([]);
  });
});
