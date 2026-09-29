import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Build assinado e publicação em canal de teste do app (issue #407)
//
// O build assinado depende de segredos que não podem ir para o repositório, e
// a publicação nas lojas não pode acontecer a cada push. Estes testes fixam as
// garantias que só existem no YAML e no Gradle: se alguém as afrouxar, nenhum
// build quebra — só o segredo vaza, ou uma versão vai para a loja sem querer.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

describe('.github/workflows/mobile-release.yml', () => {
  const workflow = conteudo('.github/workflows/mobile-release.yml');

  it('deve ser acionado apenas manualmente', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect(workflow).not.toMatch(/^ {2}pull_request:/m);
    expect(workflow).not.toMatch(/^ {2}schedule:/m);
  });

  it('deve restringir o GITHUB_TOKEN a contents: read', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('deve ter um job por plataforma', () => {
    expect(workflow).toMatch(/^ {2}android:/m);
    expect(workflow).toMatch(/^ {2}ios:/m);
  });

  it('deve exigir a confirmação do ambiente mobile-release', () => {
    const ocorrencias = workflow.match(/environment: mobile-release/g) ?? [];
    expect(ocorrencias).toHaveLength(2);
  });

  it('deve construir a partir de uma tag de versão, rastreável a um commit', () => {
    expect(workflow).toContain('ref: ${{ inputs.tag }}');
    expect(workflow).toMatch(/inputs:\n {6}tag:/);
  });

  it('deve derivar nome e número do build da versão e da execução', () => {
    expect(workflow).toContain('--build-name');
    expect(workflow).toContain('--build-number');
    expect(workflow).toContain('github.run_number');
  });

  it('deve publicar em canal de teste, nunca em produção', () => {
    expect(workflow).toMatch(/track: internal/);
    expect(workflow).not.toMatch(/track: production/);
    expect(workflow).toMatch(/altool|upload_to_testflight|testflight/i);
  });

  it('deve ler toda credencial de secrets, sem valor escrito no arquivo', () => {
    for (const segredo of [
      'ANDROID_KEYSTORE_BASE64',
      'ANDROID_KEYSTORE_PASSWORD',
      'ANDROID_KEY_ALIAS',
      'ANDROID_KEY_PASSWORD',
      'PLAY_SERVICE_ACCOUNT_JSON',
      'IOS_CERTIFICATE_BASE64',
      'IOS_CERTIFICATE_PASSWORD',
      'IOS_PROVISIONING_PROFILE_BASE64',
      'APP_STORE_CONNECT_KEY_ID',
      'APP_STORE_CONNECT_ISSUER_ID',
      'APP_STORE_CONNECT_API_KEY',
    ]) {
      expect(workflow).toContain(`secrets.${segredo}`);
    }
  });

  // O archive é assinado antes da exportação: só o ExportOptions.plist não
  // basta, e o `flutter build ipa` num runner novo não acha equipe nem perfil.
  it('deve assinar o archive do iOS com equipe e perfil explícitos', () => {
    expect(workflow).toMatch(/xcodebuild[\s\S]*archive/);
    expect(workflow).toContain('DEVELOPMENT_TEAM=');
    expect(workflow).toContain('PROVISIONING_PROFILE_SPECIFIER=');
    expect(workflow).toContain('CODE_SIGN_STYLE=Manual');
    expect(workflow).toMatch(/xcodebuild[\s\S]*-exportArchive/);
    expect(workflow).not.toContain('flutter build ipa');
  });

  it('deve guardar o bundle Android como artefato, para o primeiro envio manual', () => {
    expect(workflow).toContain('actions/upload-artifact');
    expect(workflow).toContain('app-release.aab');
  });

  it('deve falhar cedo quando faltar o segredo de assinatura', () => {
    expect(workflow).toMatch(/::error::[^\n]*(faltando|não configurado)/);
  });

  it('não deve imprimir segredo no log', () => {
    expect(workflow).not.toMatch(/echo\s+"?\$\{\{\s*secrets\./);
  });

  it('deve usar a mesma versão do Flutter do CI', () => {
    expect(workflow).toContain('.flutter-version');
  });
});

describe('.github/workflows/ci-cd.yml – release do app fora do deploy', () => {
  it('não deve assinar nem publicar o app no pipeline de push', () => {
    const ci = conteudo('.github/workflows/ci-cd.yml');
    expect(ci).not.toContain('ANDROID_KEYSTORE');
    expect(ci).not.toContain('APP_STORE_CONNECT');
  });
});

describe('assinatura do build Android', () => {
  const gradle = conteudo('apps/mobile/android/app/build.gradle.kts');

  it('deve ler a keystore de key.properties, fora do repositório', () => {
    expect(gradle).toContain('key.properties');
    expect(gradle).toContain('storeFile');
    expect(gradle).toContain('keyAlias');
  });

  it('não deve escrever senha nem caminho de keystore no Gradle', () => {
    expect(gradle).not.toMatch(/storePassword\s*=\s*"/);
    expect(gradle).not.toMatch(/keyPassword\s*=\s*"/);
  });

  it('deve assinar o release com a chave própria quando ela existir', () => {
    expect(gradle).toMatch(/signingConfigs\s*\{[\s\S]*create\("release"\)/);
    expect(gradle).toMatch(/release\s*\{[\s\S]*signingConfigs\.getByName/);
  });

  it('deve manter key.properties e keystores fora do versionamento', () => {
    const ignore = conteudo('apps/mobile/android/.gitignore');
    expect(ignore).toContain('key.properties');
    expect(ignore).toMatch(/\*\*\/\*\.keystore/);
    expect(ignore).toMatch(/\*\*\/\*\.jks/);
  });
});

describe('assinatura do build iOS', () => {
  it('deve manter certificados e perfis fora do versionamento', () => {
    const ignore = conteudo('apps/mobile/ios/.gitignore');
    expect(ignore).toMatch(/\*\.p12/);
    expect(ignore).toMatch(/\*\.mobileprovision/);
    expect(ignore).toMatch(/\*\.p8/);
  });
});
