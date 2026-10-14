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
- O login do Claude Code e do `gh` fica em volumes próprios
  (`dindin-claude-config` e `dindin-gh-config`), que sobrevivem ao rebuild.

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
2. No host, carregue a chave no ssh-agent. Sem isso o agente repassado está
   vazio e o push falha com `Permission denied (publickey)`:

   ```bash
   ssh-add --apple-use-keychain ~/.ssh/id_ed25519
   ssh-add -l   # deve listar a chave
   ```

3. Abra o repositório e escolha **Reopen in Container**. O
   `post-create.sh` instala as dependências (`npm ci` e `flutter pub get`) e
   grava as chaves do GitHub no `known_hosts`, obtidas da API por HTTPS.
4. Dentro do container, confira o acesso ao GitHub:

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

### Claude Code

Rode `claude` e faça o login. A configuração fica em `/home/node/.claude`
(`CLAUDE_CONFIG_DIR`), no volume do container, separada da do host.

### ai-memory

O ai-memory roda no host. De dentro do container, o endereço é
`host.docker.internal` no lugar de `127.0.0.1`. O token é digitado na hora,
sem eco, e nunca é versionado:

```bash
read -rs AI_MEMORY_TOKEN
claude mcp add --scope user --transport http ai-memory \
  http://host.docker.internal:<porta>/mcp \
  --header "Authorization: Bearer $AI_MEMORY_TOKEN"
```

A porta e o token são os da configuração do host (`claude mcp get ai-memory`
no host). O cadastro fica no volume do Claude Code e sobrevive ao rebuild.

## Emuladores

As portas do Hosting (5002), Functions (5001), Firestore (8080), Auth (9099),
da interface dos emuladores (4000) e do `ng serve` (4200) são encaminhadas ao
host pelo VS Code. O `devcontainer` CLI não encaminha portas.
