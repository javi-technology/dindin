import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Devcontainer isolado para os agentes de IA (issue #538)
//
// O container existe para que o agente só alcance o repositório: uma montagem
// da home do host desfaz o isolamento em silêncio, sem quebrar nada. A chave
// SSH, em particular, não entra — o push usa o ssh-agent repassado pelo host,
// que assina sem expor o arquivo da chave.
//
// E o container só serve de referência se tiver a toolchain do CI: Node,
// Java e Flutter fixados à mão no devcontainer divergiriam do pipeline na
// primeira atualização de um dos lados.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const conteudo = (arquivo: string): string =>
  readFileSync(join(repoRoot, arquivo), 'utf-8');

// O devcontainer.json aceita comentários de linha (JSONC), que o JSON.parse
// recusa.
const lerJsonc = (arquivo: string): Record<string, any> =>
  JSON.parse(conteudo(arquivo).replace(/^\s*\/\/.*$/gm, ''));

const devcontainer = (): Record<string, any> =>
  lerJsonc('.devcontainer/devcontainer.json');

const montagens = (): string[] => devcontainer().mounts ?? [];

describe('devcontainer', () => {
  it('deve existir com Dockerfile próprio', () => {
    expect(existsSync(join(repoRoot, '.devcontainer/devcontainer.json'))).toBe(
      true,
    );
    expect(existsSync(join(repoRoot, '.devcontainer/Dockerfile'))).toBe(true);
    expect(devcontainer().build.dockerfile).toBe('Dockerfile');
  });

  describe('toolchain igual à do CI', () => {
    const ci = conteudo('.github/workflows/ci-cd.yml');

    it('deve usar a versão de Node do CI', () => {
      const versoesDoCi = new Set(
        [...ci.matchAll(/node-version:\s*(\d+)/g)].map(([, versao]) => versao),
      );

      expect(versoesDoCi.size).toBe(1);
      expect(devcontainer().build.args.NODE_VERSION).toBe([...versoesDoCi][0]);
    });

    it('deve usar a versão de Java do CI', () => {
      const [, versaoDoCi] = ci.match(/java-version:\s*(\d+)/) ?? [];
      const java =
        devcontainer().features['ghcr.io/devcontainers/features/java:1'];

      expect(java.version).toBe(versaoDoCi);
      expect(java.jdkDistro).toBe('tem');
    });

    it('deve usar a versão de Flutter fixada no app', () => {
      expect(devcontainer().build.args.FLUTTER_VERSION).toBe(
        conteudo('apps/mobile/.flutter-version').trim(),
      );
    });

    // O lock fixa cada feature por digest. Feature nova sem entrada nele é
    // resolvida na hora do build, e o container deixa de ser reproduzível.
    it('deve fixar no lock todas as features declaradas', () => {
      const lock = lerJsonc('.devcontainer/devcontainer-lock.json');

      expect(Object.keys(lock.features).sort()).toEqual(
        Object.keys(devcontainer().features).sort(),
      );
      for (const feature of Object.values<any>(lock.features)) {
        expect(feature.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    });

    it('deve receber as versões como argumento no Dockerfile', () => {
      const dockerfile = conteudo('.devcontainer/Dockerfile');

      expect(dockerfile).toMatch(/^ARG NODE_VERSION$/m);
      expect(dockerfile).toMatch(/^ARG FLUTTER_VERSION$/m);
      expect(dockerfile).toContain('--branch "${FLUTTER_VERSION}"');
    });

    // A imagem `devcontainers/javascript-node:1-22` parou no 22.16, abaixo do
    // que o Angular exige; a oficial acompanha a linha 22.x, como o
    // `setup-node` do CI. É a trixie porque o binário arm64 do rtk exige a
    // glibc 2.39, e a bookworm traz a 2.36.
    it('deve partir da imagem oficial do Node, que acompanha a linha do CI', () => {
      expect(conteudo('.devcontainer/Dockerfile')).toMatch(
        /^FROM node:\$\{NODE_VERSION\}-trixie$/m,
      );
    });
  });

  describe('isolamento do host', () => {
    it('não deve montar nada da home do host', () => {
      for (const montagem of montagens()) {
        expect(montagem).not.toMatch(
          /localEnv:(HOME|USERPROFILE)|source=~|\/Users\//,
        );
      }
    });

    it('não deve montar a pasta de chaves SSH', () => {
      const tudo = JSON.stringify(devcontainer());

      expect(tudo).not.toMatch(/\.ssh/);
    });

    // Sem o repasse do agente, o agente pediria a chave para commitar — e a
    // saída mais curta seria montar a ~/.ssh.
    it('deve repassar o ssh-agent do host', () => {
      expect(montagens()).toContain(
        'source=/run/host-services/ssh-auth.sock,target=/run/host-services/ssh-auth.sock,type=bind',
      );
      expect(devcontainer().remoteEnv.SSH_AUTH_SOCK).toBe(
        '/run/host-services/ssh-auth.sock',
      );
    });

    // Os binários nativos (esbuild, rollup, lightningcss) instalados no macOS
    // não rodam no Linux do container, e o `.dart_tool` guarda caminhos
    // absolutos da máquina que o gerou: cada lado precisa da sua cópia.
    it.each([
      'node_modules',
      'apps/api/node_modules',
      'apps/web/node_modules',
      'apps/mobile/.dart_tool',
    ])('deve isolar %s do host num volume', (pasta) => {
      expect(montagens()).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `^source=dindin-[\\w-]+,target=\\$\\{containerWorkspaceFolder\\}/${pasta.replace(/\./g, '\\.')},type=volume$`,
          ),
        ),
      );
    });

    // O login do gh sobrevive a um rebuild sem vir da home do host.
    it('deve guardar a configuração do gh em volume próprio', () => {
      expect(montagens()).toContain(
        'source=dindin-gh-config,target=/home/node/.config/gh,type=volume',
      );
    });

    // O agente não vem embutido no ambiente: a imagem traz a toolchain do
    // projeto, e o agente que trabalha nele é escolha de quem o abre.
    it('não deve trazer o Claude Code', () => {
      const tudo = [
        conteudo('.devcontainer/devcontainer.json'),
        conteudo('.devcontainer/devcontainer-lock.json'),
        conteudo('.devcontainer/Dockerfile'),
        conteudo('.devcontainer/post-create.sh'),
      ].join('\n');

      expect(tudo).not.toMatch(/claude/i);
    });

    // O VS Code copia o `~/.gitconfig` do host e registra um credential
    // helper que devolve ao container as credenciais HTTPS do host — acesso
    // além do token restrito ao repositório. As duas opções que desligam isso
    // são do usuário, não do repositório; por isso o container as neutraliza
    // por conta própria. A configuração por variável de ambiente vence todos
    // os arquivos, e `credential.helper` vazio zera a lista de helpers.
    describe('credenciais git do host', () => {
      const env = (): Record<string, string> => devcontainer().containerEnv;

      it('deve zerar qualquer credential helper registrado', () => {
        const chaves = Number(env().GIT_CONFIG_COUNT);
        const helpers = Array.from({ length: chaves }, (_, i) => i).filter(
          (i) => env()[`GIT_CONFIG_KEY_${i}`] === 'credential.helper',
        );

        expect(helpers).toHaveLength(1);
        expect(env()[`GIT_CONFIG_VALUE_${helpers[0]}`]).toBe('');
      });

      // A cópia do `~/.gitconfig` traz helper, `url.insteadOf` e includes do
      // host. Com o global apontado para outro arquivo, a cópia não é lida.
      it('deve ler a configuração global de um volume próprio', () => {
        expect(env().GIT_CONFIG_GLOBAL).toBe('/home/node/.config/git/config');
        expect(montagens()).toContain(
          'source=dindin-git-config,target=/home/node/.config/git,type=volume',
        );
      });

      // O git do VS Code entrega aos terminais um askpass que usa a conta do
      // GitHub logada no host.
      it('não deve repassar a autenticação do VS Code ao git do terminal', () => {
        const settings = devcontainer().customizations.vscode.settings;

        expect(settings['git.terminalAuthentication']).toBe(false);
        expect(settings['github.gitAuthentication']).toBe(false);
      });
    });
  });

  // Sem identidade, o git recusa o commit ("Author identity unknown"): o
  // `.gitconfig` do host não é copiado, e autenticar o gh ou carregar a chave
  // SSH não define autoria.
  describe('identidade git', () => {
    const postCreate = (): string => conteudo('.devcontainer/post-create.sh');

    it('deve avisar na criação quando a identidade não está configurada', () => {
      expect(postCreate()).toContain('git config --global user.email');
      expect(postCreate()).toContain('git config --global user.name');
    });
  });

  // O AGENTS.md exige o rtk em todo comando de shell; sem ele no container,
  // o agente quebraria a regra no primeiro comando.
  // O ai-memory fica num servidor externo, alcançado pelo túnel SSH que o
  // host abre em 127.0.0.1. O servidor recusa com 403 ("forbidden host")
  // o pedido cujo Host não seja 127.0.0.1 ou localhost, então o container
  // não pode chamá-lo por host.docker.internal: um repassador local dá ao
  // agente o mesmo endereço do host.
  describe('ai-memory', () => {
    const postStart = (): string => conteudo('.devcontainer/post-start.sh');

    it('deve repassar 127.0.0.1 do container ao túnel do host', () => {
      expect(devcontainer().postStartCommand).toBe(
        'bash .devcontainer/post-start.sh',
      );
      expect(postStart()).toMatch(
        /socat TCP-LISTEN:"\$\{AI_MEMORY_PORT\}",bind=127\.0\.0\.1,fork,reuseaddr/,
      );
      expect(postStart()).toContain(
        'TCP:host.docker.internal:"${AI_MEMORY_PORT}"',
      );
      expect(conteudo('.devcontainer/Dockerfile')).toMatch(/\bsocat\b/);
    });

    it('deve ler a porta do host, com a do túnel como padrão', () => {
      expect(devcontainer().containerEnv.AI_MEMORY_PORT).toBe(
        '${localEnv:AI_MEMORY_PORT:49374}',
      );
    });

    // O `containerEnv` fica gravado na configuração do container e aparece
    // num `docker inspect`; o `remoteEnv` só nos processos da ferramenta.
    it('deve receber o token do host só no remoteEnv', () => {
      expect(devcontainer().remoteEnv.AI_MEMORY_TOKEN).toBe(
        '${localEnv:AI_MEMORY_TOKEN}',
      );
      expect(devcontainer().containerEnv).not.toHaveProperty('AI_MEMORY_TOKEN');
    });
  });

  describe('rtk', () => {
    const dockerfile = (): string => conteudo('.devcontainer/Dockerfile');

    it('deve fixar a versão no devcontainer.json', () => {
      expect(devcontainer().build.args.RTK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(dockerfile()).toMatch(/^ARG RTK_VERSION$/m);
    });

    it('deve conferir o checksum do binário de cada arquitetura', () => {
      expect(dockerfile()).toMatch(
        /alvo=aarch64-unknown-linux-gnu;\s*\\?\s*sha=[0-9a-f]{64}/,
      );
      expect(dockerfile()).toMatch(
        /alvo=x86_64-unknown-linux-musl;\s*\\?\s*sha=[0-9a-f]{64}/,
      );
      expect(dockerfile()).toContain('sha256sum -c');
    });

    it('deve verificar o binário no build', () => {
      expect(dockerfile()).toContain('rtk --version');
    });
  });

  it('deve encaminhar as portas dos emuladores e do ng serve', () => {
    const emuladores = JSON.parse(conteudo('firebase.json')).emulators;
    const portasDosEmuladores = Object.values(emuladores)
      .map((emulador: any) => emulador?.port)
      .filter((porta): porta is number => typeof porta === 'number');

    expect(portasDosEmuladores.length).toBeGreaterThan(0);
    expect(devcontainer().forwardPorts).toEqual(
      expect.arrayContaining([...portasDosEmuladores, 4000, 4200]),
    );
  });

  describe('guia', () => {
    const guia = 'docs/devcontainer.md';

    it('deve existir', () => {
      expect(existsSync(join(repoRoot, guia))).toBe(true);
    });

    it('deve ensinar a carregar a chave no agente, sem montá-la', () => {
      expect(conteudo(guia)).toContain('ssh-add');
    });

    it('deve ensinar a conectar o ai-memory sem gravar o token', () => {
      expect(conteudo(guia)).toContain(
        'http://127.0.0.1:${AI_MEMORY_PORT}/mcp',
      );
      expect(conteudo(guia)).toContain('Bearer ${AI_MEMORY_TOKEN}');
      expect(conteudo(guia)).toContain('export AI_MEMORY_TOKEN');
    });

    it('deve ensinar a configurar a identidade git no container', () => {
      expect(conteudo(guia)).toContain('git config --global user.email');
    });

    // As opções do VS Code são do usuário: o guia recomenda desligá-las
    // mesmo com a neutralização feita no container.
    it.each([
      'dev.containers.copyGitConfig',
      'dev.containers.gitCredentialHelperConfigLocation',
      'dev.containers.dockerCredentialHelper',
    ])('deve recomendar desligar %s', (opcao) => {
      expect(conteudo(guia)).toContain(opcao);
    });

    it('deve ser citado no AGENTS.md', () => {
      expect(conteudo('AGENTS.md')).toContain('docs/devcontainer.md');
    });
  });
});
