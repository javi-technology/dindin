# GitHub MCP — Manual de Uso

Este documento descreve como usar o servidor **GitHub MCP** para interagir com repositórios, issues e pull requests diretamente através de comandos.

---

## 1. Visão geral

O GitHub MCP expõe ferramentas que permitem:

- Ler e escrever arquivos em repositórios.
- Criar e consultar issues.
- Criar pull requests.
- Criar branches e fazer forks.
- Buscar repositórios no GitHub.

Toda ação é executada via chamadas à API do GitHub, portanto requer autenticação configurada no ambiente.

---

## 2. Antes de usar

1. Certifique-se de que o servidor MCP `github-mcp-server` está configurado e acessível.
2. As chamadas são feitas em nome da conta/autenticação configurada no MCP.
3. Sempre informe `owner` e `repo` nas chamadas. Para o projeto DinDin, os valores padrão são:
   - `owner`: `javi-technology`
   - `repo`: `dindin`

---

## 3. Ferramentas principais

### 3.1. Ler arquivos de um repositório

**Tool:** `get_file_contents`

Parâmetros:

| Campo    | Descrição                                   | Obrigatório |
| -------- | ------------------------------------------- | ----------- |
| `owner`  | Proprietário do repositório                 | Sim         |
| `repo`   | Nome do repositório                         | Sim         |
| `path`   | Caminho do arquivo ou diretório             | Sim         |
| `branch` | Branch de onde ler (padrão: branch default) | Não         |

**Exemplo:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "path": "README.md",
  "branch": "main"
}
```

**Uso comum no DinDin:**

- Verificar a estrutura de workflows em `.github/workflows/`.
- Ler o `firebase.json`, `package.json` ou regras do Firestore antes de fazer alterações.
- Consultar templates de issue ou PR em `.github/`.

---

### 3.2. Criar ou atualizar um arquivo

**Tool:** `create_or_update_file`

Parâmetros:

| Campo     | Descrição                                           | Obrigatório |
| --------- | --------------------------------------------------- | ----------- |
| `owner`   | Proprietário do repositório                         | Sim         |
| `repo`    | Nome do repositório                                 | Sim         |
| `path`    | Caminho do arquivo                                  | Sim         |
| `content` | Conteúdo do arquivo                                 | Sim         |
| `message` | Mensagem de commit                                  | Sim         |
| `branch`  | Branch onde o arquivo será criado/atualizado        | Sim         |
| `sha`     | SHA do arquivo existente (obrigatório ao atualizar) | Não\*       |

\*Ao atualizar um arquivo já existente, o `sha` é obrigatório. Ele pode ser obtido com `get_file_contents`.

**Exemplo de criação:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "path": ".github/workflows/review.yml",
  "content": "name: Review\n...",
  "message": "chore(#10): adiciona workflow de review",
  "branch": "issue-10"
}
```

**Uso comum no DinDin:**

- Criar ou ajustar workflows de CI/CD em `.github/workflows/`.
- Atualizar regras do Firestore (`firestore.rules`) ou índices.
- Adicionar arquivos de configuração ou documentação.

---

### 3.3. Enviar múltiplos arquivos em um único commit

**Tool:** `push_files`

Parâmetros:

| Campo     | Descrição                            | Obrigatório |
| --------- | ------------------------------------ | ----------- |
| `owner`   | Proprietário do repositório          | Sim         |
| `repo`    | Nome do repositório                  | Sim         |
| `branch`  | Branch de destino                    | Sim         |
| `files`   | Array de objetos `{ path, content }` | Sim         |
| `message` | Mensagem de commit                   | Sim         |

**Exemplo:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "branch": "issue-15",
  "files": [
    { "path": "apps/api/src/wallet/controller.ts", "content": "..." },
    { "path": "apps/api/src/wallet/controller.spec.ts", "content": "..." }
  ],
  "message": "feat(#15): adiciona controller de carteira"
}
```

**Uso comum no DinDin:**

- Enviar código de produção e testes no mesmo commit, seguindo o fluxo TDD.
- Agrupar alterações relacionadas em um único commit atômico.

---

### 3.4. Criar uma issue

**Tool:** `create_issue`

Parâmetros:

| Campo       | Descrição                        | Obrigatório |
| ----------- | -------------------------------- | ----------- |
| `owner`     | Proprietário do repositório      | Sim         |
| `repo`      | Nome do repositório              | Sim         |
| `title`     | Título da issue                  | Sim         |
| `body`      | Corpo/descrição da issue         | Não         |
| `labels`    | Array de labels                  | Não         |
| `assignees` | Array de usernames para atribuir | Não         |
| `milestone` | Número do milestone              | Não         |

**Exemplo:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "title": "fix(#20): corrige cálculo de rendimento da carteira",
  "body": "## Contexto\n\nO cálculo atual...\n\n## Critérios de aceitação\n- [ ] ...",
  "labels": ["bug", "wallet"]
}
```

**Uso comum no DinDin:**

- Registrar bugs, tarefas técnicas ou novas funcionalidades no GitHub Projects.
- Garantir que toda implementação esteja vinculada a uma issue (conforme `AGENTS.md`).

---

### 3.5. Criar um pull request

**Tool:** `create_pull_request`

Parâmetros:

| Campo                   | Descrição                          | Obrigatório |
| ----------------------- | ---------------------------------- | ----------- |
| `owner`                 | Proprietário do repositório        | Sim         |
| `repo`                  | Nome do repositório                | Sim         |
| `title`                 | Título do PR                       | Sim         |
| `head`                  | Branch com as alterações           | Sim         |
| `base`                  | Branch de destino (ex.: `develop`) | Sim         |
| `body`                  | Descrição do PR                    | Não         |
| `draft`                 | Criar como rascunho                | Não         |
| `maintainer_can_modify` | Permitir que mantenedores editem   | Não         |

**Exemplo:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "title": "feat(#12): adiciona endpoint GET /api/wallet",
  "head": "issue-12",
  "base": "develop",
  "body": "## Resumo\n...\n\nCloses #12"
}
```

**Uso comum no DinDin:**

- Abrir PRs de branches `issue-<N>` para `develop` ao finalizar uma tarefa.
- Referenciar a issue no corpo do PR com `Closes #N`.

---

### 3.6. Criar uma branch

**Tool:** `create_branch`

Parâmetros:

| Campo         | Descrição                                         | Obrigatório |
| ------------- | ------------------------------------------------- | ----------- |
| `owner`       | Proprietário do repositório                       | Sim         |
| `repo`        | Nome do repositório                               | Sim         |
| `branch`      | Nome da nova branch                               | Sim         |
| `from_branch` | Branch de origem (padrão: branch default do repo) | Não         |

**Exemplo:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "branch": "issue-25",
  "from_branch": "develop"
}
```

**Uso comum no DinDin:**

- Criar branches de trabalho a partir de `develop`, conforme o fluxo definido em `AGENTS.md`.

---

### 3.7. Buscar repositórios

**Tool:** `search_repositories`

Parâmetros:

| Campo     | Descrição                          | Obrigatório |
| --------- | ---------------------------------- | ----------- |
| `query`   | Termo de busca (sintaxe do GitHub) | Sim         |
| `page`    | Página de resultados               | Não         |
| `perPage` | Itens por página (máx. 100)        | Não         |

**Exemplo:**

```json
{
  "query": "org:javi-technology dindin",
  "perPage": 10
}
```

**Uso comum:**

- Localizar repositórios da organização ou de outros usuários.

---

### 3.8. Atualizar ou fechar uma issue

**Tool:** `update_issue`

No GitHub, pull requests também são tratados como issues. Portanto, `update_issue` pode ser usada tanto para alterar issues quanto para fechar PRs.

Parâmetros:

| Campo          | Descrição                              | Obrigatório |
| -------------- | -------------------------------------- | ----------- |
| `owner`        | Proprietário do repositório            | Sim         |
| `repo`         | Nome do repositório                    | Sim         |
| `issue_number` | Número da issue ou PR                  | Sim         |
| `title`        | Novo título                            | Não         |
| `body`         | Novo corpo                             | Não         |
| `state`        | `open` ou `closed`                     | Não         |
| `state_reason` | `completed`, `not_planned`, `reopened` | Não         |
| `labels`       | Array de labels                        | Não         |
| `assignees`    | Array de usernames                     | Não         |
| `milestone`    | Número do milestone                    | Não         |

**Exemplo — fechar uma issue:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "issue_number": 36,
  "state": "closed",
  "state_reason": "completed"
}
```

**Exemplo — fechar um PR sem merge:**

```json
{
  "owner": "javi-technology",
  "repo": "dindin",
  "issue_number": 37,
  "state": "closed",
  "state_reason": "not_planned"
}
```

**Uso comum no DinDin:**

- Fechar issues de tarefas concluídas.
- Descartar PRs de teste ou rascunho sem merge.
- Atualizar título, descrição, labels ou responsáveis de uma issue.

---

## 4. Fluxo típico no DinDin

Para uma nova tarefa vinculada à issue #42:

1. **Criar a branch:**
   - `create_branch` com `branch: "issue-42"` e `from_branch: "develop"`.

2. **Desenvolver (TDD):**
   - Escrever testes e código localmente.

3. **Enviar as alterações:**
   - Usar `push_files` para subir testes e código de produção.

4. **Abrir o PR:**
   - Usar `create_pull_request` de `issue-42` para `develop`, referenciando `Closes #42`.

5. **Aguardar revisão e merge:**
   - A revisão e o merge ainda devem ser feitos manualmente ou por outras automações.

6. **Fechar a issue após o merge (se o PR não fechar automaticamente):**
   - Usar `update_issue` com `state: "closed"` e `state_reason: "completed"`.

---

## 5. Boas práticas

- Sempre vincule commits e PRs ao número da issue, conforme `AGENTS.md`.
- Prefira `push_files` quando vários arquivos forem alterados juntos.
- Ao atualizar um arquivo existente, primeiro obtenha o `sha` com `get_file_contents`.
- Não envie secrets, tokens ou credenciais pelo MCP.
- Valide o conteúdo gerado antes de aplicar no repositório.

---

## 6. Validação realizada

Em 11/07/2026, todas as ferramentas abaixo foram testadas no repositório `javi-technology/dindin`:

| Tool                    | Status | Observação                                                  |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `get_file_contents`     | ✅ OK  | Leitura de `README.md` na `main` funcionou.                 |
| `search_repositories`   | ✅ OK  | Busca por `org:javi-technology dindin` retornou resultados. |
| `create_branch`         | ✅ OK  | Branch `test/mcp-validation` criada a partir de `develop`.  |
| `create_or_update_file` | ✅ OK  | Arquivo `.devin/.mcp-test-file.md` criado com sucesso.      |
| `push_files`            | ✅ OK  | Múltiplos arquivos enviados em um único commit.             |
| `create_issue`          | ✅ OK  | Issue `#36` criada e fechada após teste.                    |
| `create_pull_request`   | ✅ OK  | PR `#37` criado como draft e fechado sem merge.             |
| `update_issue`          | ✅ OK  | Issue e PR fechados via `update_issue`.                     |

**Limpeza:** a issue `#36`, o PR `#37` e a branch `test/mcp-validation` foram removidos após os testes. A exclusão da branch remota foi feita via `gh` porque o MCP não expõe tool de delete de branch.

---

## 7. Limitações conhecidas

- Nem todas as operações do GitHub estão disponíveis (ex.: merge de PR, criação de releases, gerenciamento de projects, exclusão de branches).
- Operações que exigem permissões elevadas podem falhar se o token do MCP não tiver escopo suficiente.
- A tool `get_me` não está disponível neste servidor. Para verificar permissões, teste com `get_file_contents` em um repositório acessível.
- Não há tool para deletar arquivos ou branches. Para limpeza, use `gh` ou a interface do GitHub.

---

## 8. Referências

- Documentação oficial da API do GitHub: https://docs.github.com/pt/rest
- Repositório do projeto DinDin: https://github.com/javi-technology/dindin
- Projeto no GitHub Projects: https://github.com/orgs/javi-technology/projects/4
