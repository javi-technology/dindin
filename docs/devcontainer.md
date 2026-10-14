# Devcontainer para os agentes de IA

O devcontainer (`.devcontainer/`) é o ambiente em que os agentes de IA
trabalham no DinDin (issue #538). Ele existe para que o agente só alcance o
repositório: rodando direto na máquina, ele lê e escreve tudo o que o usuário
alcança — outros repositórios, `~/.ssh`, credenciais do gcloud e do Firebase.

## O que fica isolado

- **Só a pasta do repositório é montada.** Nada da home do host entra, e a
  suíte da API (`tests/devcontainer.spec.ts`) reprova a montagem que a traga.
- **A chave SSH não entra no container.** O push usa o ssh-agent do host,
  repassado pelo socket `/run/host-services/ssh-auth.sock` (Docker Desktop e
  OrbStack). O agente consegue usar a chave enquanto o container roda, mas
  não lê o arquivo nem o copia para fora.
- `node_modules` e `apps/mobile/.dart_tool` ficam em volumes do container: os
  binários nativos instalados no macOS não rodam no Linux, e o `.dart_tool`
  guarda caminhos absolutos da máquina que o gerou.
- O login do `gh` fica num volume próprio (`dindin-gh-config`), que
  sobrevive ao rebuild.
- **O agente não vem na imagem.** O container traz a toolchain do projeto;
  o agente de IA que trabalha nele é instalado e autenticado por quem o
  abre, e a configuração dele fica dentro do container, não na home do host.
- **As credenciais git do host não chegam ao git do container.** O VS Code
  copia o `~/.gitconfig` do host e registra um credential helper que devolve
  ao container as credenciais HTTPS do host — acesso além do token restrito
  ao repositório. As opções que desligam isso são do usuário, não do
  repositório, então o container se protege sozinho:
  - `GIT_CONFIG_GLOBAL` aponta para o volume `dindin-git-config`, e a cópia
    do `~/.gitconfig` não é lida;
  - `credential.helper` vazio, por variável de ambiente (que vence todos os
    arquivos de configuração), zera a lista de helpers, inclusive o que o VS
    Code grava em `/etc/gitconfig` ou no global;
  - `git.terminalAuthentication` e `github.gitAuthentication` desligados
    impedem o askpass do VS Code de usar a conta do GitHub logada no host.

O isolamento é de **arquivos**, não de rede: o container acessa a internet
livremente. Um firewall de saída por lista de domínios fica para issue
própria.

## Toolchain

Node, Java e Flutter são os do CI. As versões estão no `devcontainer.json`
(`NODE_VERSION`, `FLUTTER_VERSION` e a feature do Java), e a suíte reprova
quando divergem de `.github/workflows/ci-cd.yml` ou de
`apps/mobile/.flutter-version`. Ao subir uma versão, suba nos dois lugares.

O Flutter roda `flutter test` e `flutter analyze`. Rodar o app no simulador
iOS ou no emulador Android continua sendo feito no host: o primeiro exige
macOS e o segundo, KVM.

## Primeiro uso

1. Instale um runtime de containers (Docker Desktop ou OrbStack) e a extensão
   Dev Containers do VS Code (ou o `@devcontainers/cli`).
2. No VS Code do host, desligue o repasse de credenciais (configurações de
   usuário). O container já neutraliza o git, mas assim nada é copiado:

   ```json
   "dev.containers.copyGitConfig": false,
   "dev.containers.gitCredentialHelperConfigLocation": "none",
   "dev.containers.dockerCredentialHelper": false
   ```

   Deixe `dev.containers.githubCLILoginWithToken` em `false` (o padrão), ou o
   `gh` do container herda o login do host.

3. No host, carregue a chave no ssh-agent. Sem isso o agente repassado está
   vazio e o push falha com `Permission denied (publickey)`:

   ```bash
   ssh-add --apple-use-keychain ~/.ssh/id_ed25519
   ssh-add -l   # deve listar a chave
   ```

4. Abra o repositório e escolha **Reopen in Container**. O
   `post-create.sh` instala as dependências (`npm ci` e `flutter pub get`) e
   grava as chaves do GitHub no `known_hosts`, obtidas da API por HTTPS.
5. Dentro do container, configure a identidade do autor. O `.gitconfig` do
   host não entra, e sem ela o commit falha com `Author identity unknown`. A
   configuração fica no volume `dindin-git-config` e sobrevive ao rebuild:

   ```bash
   git config --global user.name "Seu Nome"
   git config --global user.email "seu-email@exemplo.com"
   ```

   Use o e-mail cadastrado na sua conta do GitHub (ou o `noreply` dela), para
   o commit ficar associado a você.

6. Confira o acesso ao GitHub:

   ```bash
   ssh -T git@github.com
   ```

### `gh`

Autentique com um **token fine-grained** com acesso só a
`javi-technology/dindin` (Issues, Pull requests, Contents e, para o board,
Projects da organização), em vez do login completo da sua conta:

```bash
gh auth login --with-token   # cole o token e tecle Ctrl+D
```

### ai-memory

O ai-memory fica num servidor externo, alcançado pelo túnel SSH que o host
abre em `127.0.0.1:49374`. O túnel precisa estar aberto no host: se ele cair,
o container perde o acesso junto com o host.

O servidor recusa com `403 forbidden host` o pedido endereçado a
`host.docker.internal`; ele só aceita `127.0.0.1` e `localhost`. Por isso o
`post-start.sh` sobe um repassador (`socat`) em `127.0.0.1:${AI_MEMORY_PORT}`
dentro do container, que encaminha ao túnel do host. Para o agente, o
endereço é o mesmo do host:

```text
http://127.0.0.1:${AI_MEMORY_PORT}/mcp
Authorization: Bearer ${AI_MEMORY_TOKEN}
```

- `AI_MEMORY_PORT` é a porta do túnel. O padrão é `49374`; se o seu túnel
  usar outra, exporte `AI_MEMORY_PORT` no host antes de abrir o container.
- `AI_MEMORY_TOKEN` vem do ambiente do host, pelo `remoteEnv`: chega aos
  processos do container sem ficar gravado na configuração dele (um
  `docker inspect` não o mostra), no repositório ou na imagem. Cadastre o
  servidor no cliente MCP do agente referenciando a variável, nunca o valor.

No host, guarde o token no Keychain e exporte-o a partir dele, em vez de
deixá-lo em texto puro no `~/.zshrc`:

```bash
# uma vez: grava o token no Keychain (pede o valor sem eco)
security add-generic-password -a "$USER" -s ai-memory-token -w
# no ~/.zshrc
export AI_MEMORY_TOKEN="$(security find-generic-password -a "$USER" -s ai-memory-token -w)"
```

O VS Code só herda a variável quando é aberto por um terminal que a tem
(`code .`); aberto pelo Dock, ele não lê o `~/.zshrc`.

## Emuladores

As portas do Hosting (5002), Functions (5001), Firestore (8080), Auth (9099),
da interface dos emuladores (4000) e do `ng serve` (4200) são encaminhadas ao
host pelo VS Code. O `devcontainer` CLI não encaminha portas.
