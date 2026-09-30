import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Esqueleto do app Flutter e rede de proteção do CI (issue #398)
//
// O monorepo é npm e o glob `apps/*` dos workspaces alcança qualquer pasta
// nova em `apps/`. Uma pasta Flutter sem `package.json` cai nesse glob e
// surpreende o `npm ci` do CI. E as verificações do repositório não enxergam
// Dart: `npm run lint` roda `--workspaces --if-present` e `format:check` usa
// Prettier, que não formata `.dart`.
//
// Sem estes testes, "o app tem job próprio no CI" seria só uma promessa do
// guia: código Dart fora de padrão passaria pelo pipeline que bloqueia o
// deploy, e o ajuste dos workspaces poderia ser desfeito sem ninguém notar.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

describe('app Flutter em apps/mobile', () => {
  describe('projeto', () => {
    it('deve declarar o pacote e o SDK Dart no pubspec', () => {
      const pubspec = conteudo('apps/mobile/pubspec.yaml');

      expect(pubspec).toMatch(/^name:\s*dindin_mobile$/m);
      expect(pubspec).toMatch(/^\s*sdk:\s*\^?\d+\.\d+\.\d+/m);
      expect(pubspec).toMatch(/^\s*flutter:\s*['">=]/m);
    });

    it('deve ter ponto de entrada e teste', () => {
      expect(() => conteudo('apps/mobile/lib/main.dart')).not.toThrow();
      expect(() => conteudo('apps/mobile/test/app_test.dart')).not.toThrow();
    });

    it('deve suportar iOS e Android', () => {
      expect(() =>
        conteudo('apps/mobile/android/app/build.gradle.kts'),
      ).not.toThrow();
      expect(() =>
        conteudo('apps/mobile/ios/Runner.xcodeproj/project.pbxproj'),
      ).not.toThrow();
    });

    // A análise estática do Dart só existe se o projeto apontar para um
    // conjunto de regras; sem `analysis_options.yaml` o `flutter analyze`
    // passa em código que o repositório recusaria em TypeScript.
    it('deve configurar a análise estática do Dart', () => {
      expect(conteudo('apps/mobile/analysis_options.yaml')).toContain(
        'flutter_lints',
      );
    });
  });

  // A versão do SDK fixada num arquivo próprio é o que permite ao CI usar
  // exatamente a mesma do desenvolvedor: um número solto no workflow divergiria
  // da máquina local na primeira atualização.
  describe('versão do SDK do Flutter', () => {
    const versaoFixada = (): string =>
      conteudo('apps/mobile/.flutter-version').trim();

    it('deve estar fixada no repositório', () => {
      expect(versaoFixada()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('deve ser a mesma usada pelo CI', () => {
      expect(conteudo('.github/workflows/ci-cd.yml')).toContain(
        `flutter-version: ${versaoFixada()}`,
      );
    });
  });

  // O glob `apps/*` alcançaria `apps/mobile`, que não tem `package.json`.
  // Listar as pastas de Node uma a uma é o que mantém o `npm ci` previsível
  // quando outra pasta não-Node aparecer em `apps/`.
  describe('workspaces npm', () => {
    const workspaces = (): string[] =>
      JSON.parse(conteudo('package.json')).workspaces;

    it('não deve abarcar a pasta do app Flutter', () => {
      expect(workspaces()).not.toContain('apps/*');
      expect(workspaces().some((w) => w.startsWith('apps/mobile'))).toBe(false);
    });

    it('deve seguir declarando os workspaces de Node', () => {
      expect(workspaces()).toEqual(
        expect.arrayContaining(['apps/api', 'apps/web', 'packages/*']),
      );
    });
  });

  describe('.gitignore', () => {
    const ignore = (): string[] =>
      conteudo('.gitignore')
        .split('\n')
        .map((linha) => linha.trim());

    // Artefatos de build do Flutter são pesados e regeneráveis; o `.dart_tool`
    // guarda caminhos absolutos da máquina, que quebram para qualquer outro.
    it.each([
      'apps/mobile/build/',
      'apps/mobile/.dart_tool/',
      '.flutter-plugins-dependencies',
    ])('deve ignorar %s', (padrao) => {
      expect(ignore()).toContain(padrao);
    });

    // A regra de segurança do projeto vale também para o app: estes arquivos
    // carregam identificadores do projeto Firebase e chaves de API.
    it.each(['google-services.json', 'GoogleService-Info.plist'])(
      'deve manter %s fora do versionamento',
      (credencial) => {
        expect(ignore()).toContain(credencial);
      },
    );
  });

  describe('job de CI do app', () => {
    const workflow = (): string => conteudo('.github/workflows/ci-cd.yml');

    it('deve existir', () => {
      expect(workflow()).toMatch(/^ {2}build-and-test-mobile:$/m);
    });

    it('deve instalar o Flutter com cache de dependências', () => {
      expect(workflow()).toContain('subosito/flutter-action');
      expect(workflow()).toContain('cache: true');
    });

    // As três verificações equivalem ao que o repositório já exige das outras
    // camadas: `format:check`, `lint` e a suíte.
    it.each([
      ['formatação', 'dart format --output=none --set-exit-if-changed .'],
      ['análise estática', 'flutter analyze --fatal-infos'],
      ['testes', 'flutter test'],
    ])('deve rodar %s', (_rotulo, comando) => {
      expect(workflow()).toContain(comando);
    });

    it('deve bloquear o deploy', () => {
      const deploy = workflow().slice(workflow().indexOf('\n  deploy:'));
      const needs = deploy.slice(0, deploy.indexOf('\n    if:'));

      expect(needs).toContain('- build-and-test-mobile');
    });
  });

  // O AGENTS.md é a fonte única das regras: um app numa linguagem nova que
  // não aparece ali deixa a regra do projeto incompleta.
  describe('AGENTS.md', () => {
    const guia = (): string => conteudo('AGENTS.md');

    it('deve descrever a pasta do app', () => {
      expect(guia()).toContain('apps/mobile');
    });

    it.each([
      'npm run mobile:format',
      'npm run mobile:lint',
      'npm run mobile:test',
    ])('deve documentar o comando %s', (comando) => {
      expect(guia()).toContain(comando);
    });

    it('deve registrar a ferramenta de teste da camada', () => {
      const tabela = guia().slice(guia().indexOf('| Camada'));

      expect(tabela).toMatch(/\|\s*Mobile\s*\|\s*flutter test\s*\|/i);
    });
  });

  describe('scripts do npm', () => {
    const scripts = (): Record<string, string> =>
      JSON.parse(conteudo('package.json')).scripts;

    it.each([
      ['mobile:format', 'dart format'],
      ['mobile:lint', 'flutter analyze'],
      ['mobile:test', 'flutter test'],
    ])('deve expor %s', (script, comando) => {
      expect(scripts()[script]).toContain(comando);
    });
  });
});

// ---------------------------------------------------------------------------
// Autenticação nativa do app (issue #400)
//
// A configuração do Firebase no app é credencial e mora fora do repositório;
// o que precisa estar versionado é o caminho para obtê-la. Sem isso, o
// próximo a clonar descobre o passo pelo erro em tempo de execução.
// ---------------------------------------------------------------------------
describe('Firebase no app', () => {
  const doc = (): string => conteudo('docs/mobile-firebase.md');

  it('deve documentar como obter os arquivos de configuração', () => {
    expect(doc()).toContain('google-services.json');
    expect(doc()).toContain('GoogleService-Info.plist');
  });

  // O login com Google no Android simplesmente não funciona sem o SHA
  // registrado, e o erro que aparece não diz qual é o problema.
  it('deve documentar o registro do SHA-1', () => {
    expect(doc()).toContain('SHA-1');
    expect(doc()).toContain('signingReport');
  });

  it('deve registrar o identificador de pacote das duas plataformas', () => {
    expect(doc()).toContain('tech.javi.dindin');
    expect(conteudo('apps/mobile/android/app/build.gradle.kts')).toContain(
      'applicationId = "tech.javi.dindin"',
    );
    expect(
      conteudo('apps/mobile/ios/Runner.xcodeproj/project.pbxproj'),
    ).toContain('PRODUCT_BUNDLE_IDENTIFIER = tech.javi.dindin;');
  });

  it('não deve versionar nenhuma configuração do Firebase', () => {
    const versionados = execFileSync(
      'git',
      [
        'ls-files',
        '--',
        'apps/mobile/**/google-services.json',
        'apps/mobile/**/GoogleService-Info.plist',
        'apps/mobile/**/firebase_options.dart',
      ],
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim();

    expect(versionados).toBe('');
  });
});
