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
    // `setup-node` do CI.
    it('deve partir da imagem oficial do Node, que acompanha a linha do CI', () => {
      expect(conteudo('.devcontainer/Dockerfile')).toMatch(
        /^FROM node:\$\{NODE_VERSION\}-bookworm$/m,
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

    // O login do Claude Code e do gh sobrevive a um rebuild sem vir da home
    // do host.
    it('deve guardar a configuração do Claude Code em volume próprio', () => {
      const env = devcontainer().containerEnv;

      expect(env.CLAUDE_CONFIG_DIR).toBe('/home/node/.claude');
      expect(montagens()).toContain(
        'source=dindin-claude-config,target=/home/node/.claude,type=volume',
      );
      expect(montagens()).toContain(
        'source=dindin-gh-config,target=/home/node/.config/gh,type=volume',
      );
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

    it('deve ensinar a conectar o ai-memory do host', () => {
      expect(conteudo(guia)).toContain('host.docker.internal');
    });

    it('deve ser citado no AGENTS.md', () => {
      expect(conteudo('AGENTS.md')).toContain('docs/devcontainer.md');
    });
  });
});
