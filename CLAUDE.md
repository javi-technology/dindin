# DinDin — Diretrizes do Projeto

> Fonte das regras: `.github/copilot-instructions.md` e `.devin/rules/`. Ao alterar uma regra aqui, mantenha esses arquivos sincronizados.

## Idioma

- **Sempre responder em português do Brasil (pt-BR)**: interações, explicações, comentários, descrições de PR e mensagens de commit.

## Visão Geral

Monorepo de app financeiro pessoal. Stack: Angular 22 + Tailwind CSS 4 (frontend), Cloud Functions + Express + Node 22 (backend), Firestore, Firebase Auth/Hosting. Projeto Firebase: `dindin-4e720`.

### Estrutura do Repositório

```
apps/
  api/    # Cloud Functions (Express + TypeScript) — regras de negócio e APIs; src/ e tests/
  web/    # Angular + Tailwind — src/app/{core,features,shared}/
packages/
  models/        # Models do Firestore (User, Wallet, Position, Fridge, FridgeItem)
  shared-types/  # Tipos TypeScript compartilhados entre frontend e backend
```

## Comandos

```bash
npm install                                    # instalar dependências
firebase emulators:start                       # emuladores (Hosting :5002, Functions :5001, Firestore :8080, Auth :9099)
npm run api:build                              # build da API
npm run build --workspace=apps/web             # build do frontend
npm run test --workspace=apps/api              # testes da API (Jest)
npm run test --workspace=apps/web              # testes do frontend (Karma)
npm run lint                                   # análise estática (ESLint)
npm run format                                 # formatar com Prettier
npm run format:check                           # verificar formatação
firebase deploy                                # deploy completo
```

## Fluxo de Trabalho Obrigatório

### Vínculo com Issues

- **Toda implementação deve estar vinculada a uma issue do GitHub Projects** (https://github.com/orgs/javi-technology/projects/4).
- Antes de iniciar qualquer trabalho, verificar se existe issue aberta (`gh issue list`). Se não existir, criar.
- Nenhum commit sem o número da issue correspondente.

#### Template obrigatório

**Toda issue DEVE seguir, de forma obrigatória, um template de `.github/ISSUE_TEMPLATE/`.**
Isso vale também para issues criadas pela CLI (`gh issue create`), que não aplica o
template sozinha. Uma issue fora do template não está pronta para ser trabalhada.

| Tipo de issue                                      | Template             | Título            | Label         |
| -------------------------------------------------- | -------------------- | ----------------- | ------------- |
| Defeito (bug, regressão, teste intermitente)       | `bug_report.md`      | `[Bug] - ...`     | `bug`         |
| Demais (funcionalidade, melhoria, refactor, docs…) | `feature_request.md` | `[Feature] - ...` | `enhancement` |

- O corpo segue **exatamente** o formato do template, sem acrescentar nem trocar
  estrutura:

  ```markdown
  **Contexto:**

  - ...

  **DOR:**

  - ...

  **DOD:**

  - ...
  ```

  - As seções são **Contexto**, **DOR** e **DOD**, nessa ordem, com o título em
    negrito terminado em dois-pontos.
  - Cada seção contém só bullet points simples (`- `). **Não usar** checkbox
    (`- [ ]`), sub-bullets, tabelas, títulos (`##`) nem seções extras.
  - **Contexto:** o problema e por que ele importa. **DOR** (Definition of Ready):
    o que se quer e o que precisa estar claro para começar. **DOD** (Definition of
    Done): os critérios de aceite, um por bullet.
  - Detalhes extras (escopo, fora de escopo, exemplos) viram bullets dentro dessas
    seções.

- Labels complementares (`fase-N`, `test`, `debito-tecnico`, `documentation`…) são
  somadas à label do template, nunca a substituem.
- `custom.md` está vazio e não deve ser usado.

#### Campos obrigatórios no GitHub Projects

Toda issue criada deve ser adicionada ao project e ter os campos abaixo preenchidos (além de `Status`, que começa em `Backlog`):

| Campo      | Valores                      | Critério                                                                                              |
| ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Estimate` | 1, 2, 3, 5, 8 (story points) | Esforço relativo (ex.: ajuste pontual = 1–2, feature ponta a ponta = 5)                               |
| `Size`     | XS, S, M, L, XL              | Tamanho da mudança (arquivos/camadas afetadas)                                                        |
| `Priority` | P0, P1, P2, P3               | P0 = incidente/bloqueante, P1 = risco financeiro ou de dados, P2 = melhoria relevante, P3 = desejável |

```bash
gh issue create --title "[Feature] - ..." --label "enhancement" --body-file issue.md  # corpo no formato do template
gh project item-add 4 --owner javi-technology --url <url_da_issue>
gh project field-list 4 --owner javi-technology           # ids dos campos e opções
gh project item-edit --project-id <project_id> --id <item_id> --field-id <estimate_id> --number <pontos>
gh project item-edit --project-id <project_id> --id <item_id> --field-id <size_id> --single-select-option-id <opcao_id>
gh project item-edit --project-id <project_id> --id <item_id> --field-id <priority_id> --single-select-option-id <opcao_id>
```

- Uma issue sem `Estimate`, `Size` e `Priority` não está pronta para ser trabalhada.

#### Status do card no GitHub Projects

O `Status` acompanha o andamento e é atualizado em três momentos — o board só
serve para saber o que está em andamento se ele refletir a realidade:

| Momento                                                       | Status        |
| ------------------------------------------------------------- | ------------- |
| Issue criada, com `Estimate`, `Size` e `Priority` preenchidos | `Ready`       |
| Branch `issue-<N>` criada                                     | `In progress` |
| PR aberto                                                     | `In review`   |

- **Antes de criar a branch**, garantir que o card esteja em `Ready`: um card em
  `Backlog` sinaliza que a issue ainda não foi refinada.
- A transição para `In progress` acompanha a criação da branch, não o primeiro
  commit.
- Em stacked PR, cada issue da pilha segue o ciclo por conta própria.

```bash
# id do item da issue no project
gh project item-list 4 --owner javi-technology --format json

gh project item-edit --project-id <project_id> --id <item_id> \
  --field-id <status_id> --single-select-option-id <opcao_id>
```

Ids atuais do project (reconferir com `gh project field-list 4 --owner javi-technology`):

| Referência    | Id                               |
| ------------- | -------------------------------- |
| `project_id`  | `PVT_kwDODUNtT84Bc4Zk`           |
| `status_id`   | `PVTSSF_lADODUNtT84Bc4ZkzhXd-0o` |
| `Backlog`     | `f75ad846`                       |
| `Ready`       | `61e4505c`                       |
| `In progress` | `47fc9ee4`                       |
| `In review`   | `df73e18b`                       |
| `Done`        | `98236657`                       |

### TDD Estrito (Red → Green → Refactor)

Todo desenvolvimento segue TDD. Não há exceção.

1. **RED** — Escrever teste que descreve o comportamento esperado. Rodar e confirmar que falha.
2. **GREEN** — Escrever o mínimo de código para o teste passar. Rodar e confirmar que passa.
3. **REFACTOR** — Refatorar sem quebrar os testes.

Regras:

- Nunca escrever código de produção antes de ter um teste falhando.
- Nunca escrever mais código do que o necessário para o teste passar.
- Testes mantidos junto ao código que testam, conforme a localização de cada camada (tabela abaixo).

### Fluxo Completo de Tarefa

1. Verificar/criar issue no GitHub Projects, com `Estimate`, `Size` e `Priority` preenchidos → `Status: Ready`
2. Preparar branch: `develop` → atualizar com `main` → criar `issue-<N>` (em stacked PR, a partir da branch anterior da pilha) → `Status: In progress`
3. RED → GREEN → REFACTOR (commits `test(#N)`, `feat(#N)`, `refactor(#N)`)
4. Abrir PR de `issue-<N>` para `develop` (em stacked PR, para a branch anterior da pilha), referenciando a issue (`Closes #N`) → `Status: In review`
5. Merge após revisão

## Testes

| Camada   | Ferramenta                | Localização                   |
| -------- | ------------------------- | ----------------------------- |
| API      | Jest                      | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine (ng test) | `apps/web/src/**/*.spec.ts`   |

### Frontend: testes unitários browserless

- **Os testes unitários do frontend DEVEM rodar em modo browserless.** Não há exceção: um teste que exija janela de navegador não entra no projeto.
- Karma + Jasmine com **ChromeHeadless** (`apps/web/karma.conf.js`, `singleRun: true`) — rápidos, determinísticos e compatíveis com CI sem interface gráfica.
- Evitar dependências de APIs de navegador (`window`, `document`, `setTimeout` reais) quando não forem essenciais.
- Preferir mockar serviços e inputs/outputs de componentes em vez de disparar eventos reais do DOM.
- Não adicionar browsers reais (Chrome, Firefox, Safari) na configuração de testes.

## Git e Branches

### Preparação de Branch (sempre executar antes de implementar)

```bash
git checkout main && git pull origin main
git checkout develop 2>/dev/null || git checkout -b develop
git pull origin develop 2>/dev/null || true
git merge main
git checkout -b issue-<numero_issue>
```

### Regras de Branch

- Branch da issue: **exatamente** `issue-<numero_issue>` (ex: `issue-3`).
- Toda implementação parte da `develop` e retorna para `develop` via PR.
- **Exceção — stacked PR:** quando for solicitado stacked PR, é permitido criar a
  branch `issue-<N>` a partir da branch de outra issue da pilha
  (`git checkout -b issue-<N> issue-<anterior>`), e o PR aponta para essa branch.
  Só o primeiro PR da pilha aponta para `develop`.
  - Os PRs são revisados e mergeados **na ordem da pilha**.
  - Correção numa branch da base exige atualizar as de cima em ordem
    (`git rebase --onto <base-nova> <ponta-antiga> issue-<N>`) e reenviar com
    `git push --force-with-lease`, nunca `--force` puro.
- A `develop` deve estar sincronizada com a `main` antes de criar nova branch.
- Nunca commitar diretamente na `main` ou `develop`.

### Padrão de Commits

```
<tipo>(#<issue>): <descrição curta no imperativo>
```

Tipos: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `style`.

Exemplos:

```
feat(#12): adiciona endpoint GET /api/wallet
test(#12): adiciona testes do endpoint GET /api/wallet
fix(#15): corrige cálculo de total da carteira
```

Regras:

- Descrição **sempre em português (pt-BR)**, no imperativo ("adiciona", "corrige", "remove").
- Máximo 72 caracteres na primeira linha. Sem ponto final.
- Commits atômicos: um commit por mudança lógica.
- Nunca commitar com testes falhando.

## Padrões de UX e Código

### Ícones

- Usar **@lucide/angular** (open source). Importar apenas os ícones utilizados (SVG inline, tree-shakable).

### Formatação

- Código formatado com **Prettier** (`npm run format`) antes de commitar.
- Código analisado com **ESLint** (`npm run lint`) antes de commitar. Flat config:
  `eslint.config.mjs` na raiz (api e packages) e `apps/web/eslint.config.mjs`
  (angular-eslint, incluindo regras de template `.html`).
- **Não há hook de pre-commit**: rodar `npm run format` e `npm run lint`
  manualmente antes de cada commit.
- O job `lint` do CI bloqueia o deploy. A formatação **não** é verificada no CI,
  então depende de rodar o Prettier antes do commit.

### Locale Brasileiro em Campos Numéricos

- Campos de preço/valor monetário devem aceitar vírgula como separador decimal (ex: `1,55`, `0,95`).
- Fazer parse correto desses valores para número antes de enviar à API.

### Subscriptions em Componentes

- Encerrar toda subscription com **`takeUntilDestroyed`** (`@angular/core/rxjs-interop`).
  Fora de contexto de injeção, passar o `DestroyRef`: `takeUntilDestroyed(this.destroyRef)`.
- **Não** criar `Subject` de destruição (`destroy$`) nem `ngOnDestroy` só para
  limpar subscription: esquecer o `next()` vaza sem erro de compilação ou teste.
- Para **cancelar requisição em voo** (ex.: trocar de carteira antes da resposta
  chegar), usar `switchMap` sobre um `Subject` do parâmetro, não um `Subject` de
  abort manual. Cancelamento e destruição são preocupações diferentes.

### Confirmação de Ações Destrutivas

- **Não usar** `window.confirm`, `window.alert` ou `window.prompt` nativos.
- Sempre usar **modal customizado** para confirmação de exclusão ou ações destrutivas.
- Para confirmação, usar o componente compartilhado
  `shared/components/confirm-dialog` (`<app-confirm-dialog>`), que já traz
  `role="dialog"`, `aria-modal`, fechamento por `Esc` e clique no fundo, foco
  preso enquanto aberto e devolvido ao gatilho ao fechar. Não reimplementar o
  markup do modal na feature.
- Para **modal de formulário**, usar `shared/components/modal`
  (`<app-modal>`), que traz as mesmas garantias e projeta o formulário com
  `<ng-content>`. A feature informa `title`, `testId` e, quando precisar,
  `maxWidth`, e reage a `(closed)`. O rodapé com os botões pertence ao
  formulário projetado, porque só ele sabe quando o envio é válido.
- Com o modal compartilhado, a feature **não** declara `@HostListener` de
  `Escape`: quem escuta o teclado é o modal.

### Erros da API

- Falha de negócio é sinalizada com **`HttpError`** (`apps/api/src/shared/http-error.ts`),
  nunca com `Object.assign(new Error(...), { statusCode })` à mão: use as
  fábricas `badRequest`, `notFound`, `conflict`, `tooManyRequests`,
  `badGateway` e `internal`. O `asyncHandler` traduz `statusCode`/`expose` em
  resposta.
- `expose` segue o padrão da classe: 4xx expõe a mensagem, 5xx não. Só marque
  um 5xx como exposto quando o texto for escrito para a tela (ex.: o 502 do
  provedor de IA).
- **Mensagens de erro sempre em português (pt-BR)**, porque algumas chegam à
  tela do usuário. Ficam em inglês apenas o `statusText` do HTTP e códigos de
  contrato consumidos pelo frontend, como `code: 'SUBSCRIPTION_REQUIRED'`.

### Logs

- Usar o **logger estruturado** (`apps/api/src/shared/logger.ts`): `logInfo`,
  `logWarn` e `logError`, com um nome de evento (`'updateAllQuotes.done'`) e
  campos em objeto. Nada de `console.log`/`console.error` com texto
  interpolado — o Cloud Logging publica os campos como `jsonPayload`, que é
  filtrável por rota, status ou uid.
- **Nunca logar o corpo da requisição**: o logger descarta a chave `body`, e o
  que trafega nas rotas é dado financeiro do usuário. Método, rota e uid
  bastam para localizar a falha.
- Toda resposta é registrada pelo middleware de requisições, inclusive as sem
  corpo (204, 401).

## Segurança

- Nunca commitar credenciais: `sa-key.json`, `service-account*.json` e `.env*` estão no `.gitignore` e devem permanecer fora do versionamento.

## RTK — Token-Optimized CLI

**rtk** é um proxy de CLI que filtra e comprime saídas de comandos, economizando 60-90% de tokens.

Sempre prefixar comandos de shell com `rtk`:

```bash
# Em vez de:              Use:
git status                 rtk git status
git log -10                rtk git log -10
npm run test               rtk npm run test
```

Comandos meta (usar diretamente):

```bash
rtk gain              # dashboard de economia de tokens
rtk gain --history    # histórico de economia por comando
rtk discover          # encontrar oportunidades perdidas de uso do rtk
rtk proxy <cmd>       # rodar sem filtragem, mas registrar uso
```
