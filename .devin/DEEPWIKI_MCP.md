# DeepWiki MCP — Manual de Uso

Este documento descreve como usar o servidor **DeepWiki MCP** para consultar documentação gerada por IA sobre repositórios do GitHub.

---

## 1. Visão geral

O DeepWiki MCP fornece ferramentas para:

- Listar a estrutura de documentação (wiki) de um repositório.
- Ler o conteúdo completo da wiki de um repositório.
- Fazer perguntas específicas sobre o código e a arquitetura de um repositório.

O conteúdo é gerado automaticamente pelo DeepWiki a partir do código-fonte do repositório. Se o repositório ainda não foi indexado, as ferramentas retornarão um erro indicando como indexá-lo.

---

## 2. Antes de usar

1. Certifique-se de que o servidor MCP `deepwiki` está configurado e acessível.
2. Os repositórios devem estar no formato `owner/repo` (ex.: `javi-technology/dindin`).
3. O repositório deve estar indexado no DeepWiki. Caso contrário, será necessário visitar `https://deepwiki.com/owner/repo` para iniciar a indexação.

---

## 3. Ferramentas principais

### 3.1. Listar a estrutura da wiki

**Tool:** `read_wiki_structure`

Retorna a lista de tópicos e páginas disponíveis na wiki do repositório.

Parâmetros:

| Campo    | Descrição                                  | Obrigatório |
| -------- | ------------------------------------------ | ----------- |
| `repoName` | Repositório no formato `owner/repo`        | Sim         |

**Exemplo:**

```json
{
  "repoName": "facebook/react"
}
```

**Resposta esperada:**

```
Available pages for facebook/react:

- 1 React Repository Overview
  - 1.1 Repository Structure and Packages
  - 1.2 Feature Flags System
- 2 Core Reconciler Architecture
  - 2.1 Fiber Work Loop and Scheduling
  ...
```

**Uso comum no DinDin:**

- Verificar se o repositório `javi-technology/dindin` já possui wiki indexada.
- Explorar tópicos de documentação de dependências ou bibliotecas de referência.

---

### 3.2. Ler o conteúdo da wiki

**Tool:** `read_wiki_contents`

Retorna o conteúdo completo da wiki de um repositório.

Parâmetros:

| Campo    | Descrição                                  | Obrigatório |
| -------- | ------------------------------------------ | ----------- |
| `repoName` | Repositório no formato `owner/repo`        | Sim         |

**Exemplo:**

```json
{
  "repoName": "facebook/react"
}
```

**Uso comum:**

- Obter uma visão geral documentada de um repositório desconhecido.
- Entender arquitetura, estrutura de pacotes e dependências.

> **Atenção:** o conteúdo pode ser longo. Dependendo do tamanho da wiki, a resposta pode ser truncada.

---

### 3.3. Fazer perguntas sobre o repositório

**Tool:** `ask_question`

Faz uma pergunta específica sobre o repositório e recebe uma resposta fundamentada no código-fonte.

Parâmetros:

| Campo      | Descrição                                                            | Obrigatório |
| ---------- | -------------------------------------------------------------------- | ----------- |
| `repoName` | Repositório no formato `owner/repo` ou array de repositórios (máx. 10) | Sim         |
| `question` | Pergunta em inglês ou português sobre o repositório                  | Sim         |

**Exemplo:**

```json
{
  "repoName": "facebook/react",
  "question": "How does the React Fiber work loop schedule updates?"
}
```

**Uso comum no DinDin:**

- Entender como uma biblioteca externa funciona antes de integrá-la.
- Consultar padrões e decisões de arquitetura de projetos de referência.
- Pesquisar soluções para problemas em dependências.

---

## 4. Como indexar um novo repositório

Se o repositório ainda não foi indexado, as ferramentas retornarão um erro como:

```
Error fetching wiki for owner/repo: Repository not found.
Visit https://deepwiki.com/owner/repo to index it.
```

Para indexar:

1. Acesse `https://deepwiki.com/owner/repo` no navegador.
2. Siga as instruções do DeepWiki para gerar a documentação.
3. Após a indexação, as ferramentas do MCP estarão disponíveis para consulta.

> No momento, o repositório `javi-technology/dindin` **não está indexado** no DeepWiki. Para usá-lo, é necessário realizar a indexação primeiro.

---

## 5. Fluxo típico de uso

### 5.1. Explorar um repositório desconhecido

1. Verifique a estrutura da wiki com `read_wiki_structure`.
2. Leia o conteúdo geral com `read_wiki_contents`.
3. Faça perguntas específicas com `ask_question` para aprofundar pontos de interesse.

### 5.2. Resolver uma dúvida técnica

1. Use `ask_question` com uma pergunta objetiva sobre o comportamento ou a arquitetura.
2. Se a resposta for insuficiente, use `read_wiki_contents` para obter contexto mais amplo.

---

## 6. Validação realizada

Em 11/07/2026, as ferramentas do DeepWiki MCP foram testadas:

### Repositório `javi-technology/dindin`

| Tool                 | Status | Observação                                      |
| -------------------- | ------ | ----------------------------------------------- |
| `read_wiki_structure` | ⚠️ N/A | Repositório não indexado no DeepWiki.           |
| `read_wiki_contents`  | ⚠️ N/A | Repositório não indexado no DeepWiki.           |
| `ask_question`        | ⚠️ N/A | Repositório não indexado no DeepWiki.           |

**Mensagem de erro:**

```
Error fetching wiki for javi-technology/dindin: Repository not found.
Visit https://deepwiki.com/javi-technology/dindin to index it.
```

### Repositório `facebook/react` (referência)

| Tool                 | Status | Observação                                      |
| -------------------- | ------ | ----------------------------------------------- |
| `read_wiki_structure` | ✅ OK  | Estrutura de tópicos retornada corretamente.     |
| `read_wiki_contents`  | ✅ OK  | Conteúdo completo da wiki retornado.            |
| `ask_question`        | ✅ OK  | Resposta fundamentada no código-fonte.          |

---

## 7. Boas práticas

- Sempre comece com `read_wiki_structure` para confirmar se o repositório está indexado.
- Faça perguntas em inglês para obter melhores resultados, já que a maioria do código-fonte e documentação técnica está nesse idioma.
- Use `ask_question` para dúvidas pontuais; use `read_wiki_contents` para visão geral.
- Se o repositório não estiver indexado, acesse o link indicado na mensagem de erro para gerar a wiki.
- Não envie secrets, tokens ou informações sensíveis nas perguntas.

---

## 8. Limitações conhecidas

- O repositório precisa estar previamente indexado no DeepWiki.
- Não é possível indexar repositórios diretamente pelo MCP; a indexação é feita pelo site do DeepWiki.
- A wiki é gerada por IA e pode conter imprecisões. Sempre valide informações críticas com o código-fonte original.
- Respostas muito longas podem ser truncadas.

---

## 9. Referências

- Site DeepWiki: https://deepwiki.com
- Indexação do DinDin: https://deepwiki.com/javi-technology/dindin
- Repositório do projeto DinDin: https://github.com/javi-technology/dindin
