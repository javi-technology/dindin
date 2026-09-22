# DinDin — Diretrizes para Agentes

> Este arquivo deriva de `CLAUDE.md`. Ao mudar uma regra, mantenha os dois
> arquivos, `.github/copilot-instructions.md` e `.devin/rules/` sincronizados.

## Idioma e contexto

- Responda, escreva comentários, descrições de PR e mensagens de commit sempre
  em português do Brasil (pt-BR).
- DinDin é um monorepo de finanças pessoais: Angular 19 + Tailwind CSS 4 no
  frontend; Cloud Functions + Express + Node 22 na API; Firestore e Firebase
  Auth/Hosting. Projeto Firebase: `dindin-4e720`.
- Estrutura principal:
  - `apps/api`: Cloud Functions, regras de negócio e APIs (`src/`, `tests/`).
  - `apps/web`: Angular (`src/app/{core,features,shared}/`).
  - `packages/models`: modelos do Firestore.
  - `packages/shared-types`: tipos compartilhados entre frontend e backend.

## Comandos

```bash
npm install
firebase emulators:start
npm run api:build
npm run build --workspace=apps/web
npm run test --workspace=apps/api
npm run test --workspace=apps/web
npm run lint
npm run format
npm run format:check
firebase deploy
```

Use `rtk` antes de comandos de shell sempre que disponível (por exemplo,
`rtk git status`, `rtk npm run test`). Os comandos próprios do RTK (`rtk gain`,
`rtk discover` e `rtk proxy`) não precisam do prefixo.

## Workflow obrigatório

### Issues e GitHub Projects

- Toda implementação deve estar vinculada a uma issue do GitHub Projects:
  `https://github.com/orgs/javi-technology/projects/4`.
- Antes de começar, procure uma issue aberta com `gh issue list`. Se não houver
  issue, crie uma; nenhum commit pode existir sem o número correspondente.
- Toda issue deve usar exatamente um template de `.github/ISSUE_TEMPLATE/`:
  - bug, regressão ou teste intermitente: `bug_report.md`, título `[Bug] - ...`
    e label `bug`;
  - feature, melhoria, refactor ou documentação: `feature_request.md`, título
    `[Feature] - ...` e label `enhancement`.
- `custom.md` é vazio e não deve ser usado. Labels complementares somam-se à
  label do template, nunca a substituem.
- O corpo usa apenas estas seções, nesta ordem, com bullets simples: 

  ```markdown
  **Contexto:**

  - ...

  **DOR:**

  - ...

  **DOD:**

  - ...
  ```

  Não use checkboxes, sub-bullets, tabelas, títulos extras ou seções extras.
  Contexto descreve o problema; DOR deixa o trabalho pronto para começar; DOD
  contém um critério de aceite por bullet.
- Adicione a issue ao projeto e preencha `Estimate` (1, 2, 3, 5 ou 8), `Size`
  (XS, S, M, L ou XL) e `Priority` (P0–P3). Sem esses campos, a issue não está
  pronta.
- Status do card:
  - issue refinada e com os campos preenchidos: `Ready`;
  - branch `issue-<N>` criada: `In progress`;
  - PR aberto: `In review`.
- Antes de criar uma branch, confirme que a issue está em `Ready`. Em stacked
  PRs, cada issue segue esse ciclo independentemente.
- Reconfirme IDs com `gh project field-list 4 --owner javi-technology` antes de
  editar o projeto. Os IDs atuais são:

  | Referência | Id |
  | --- | --- |
  | project_id | `PVT_kwDODUNtT84Bc4Zk` |
  | status_id | `PVTSSF_lADODUNtT84Bc4ZkzhXd-0o` |
  | Backlog | `f75ad846` |
  | Ready | `61e4505c` |
  | In progress | `47fc9ee4` |
  | In review | `df73e18b` |
  | Done | `98236657` |

### TDD estrito

Todo desenvolvimento segue Red → Green → Refactor, sem exceção:

1. RED: escreva o teste do comportamento e confirme que ele falha.
2. GREEN: escreva o mínimo necessário e confirme que passa.
3. REFACTOR: melhore o código mantendo os testes verdes.

Nunca escreva código de produção antes de um teste falhando nem mais código do
que o necessário. Mantenha os testes junto à camada que validam.

### Fluxo de uma tarefa

1. Verifique ou crie a issue, preencha Estimate, Size e Priority e leve-a a
   `Ready`.
2. Atualize `develop` com `main`, crie `issue-<N>` e mova o card a `In progress`.
3. Faça RED → GREEN → REFACTOR em commits atômicos (`test(#N)`, `feat(#N)`,
   `refactor(#N)`).
4. Abra PR para `develop`, ou para a branch anterior se for uma pilha, com
   `Closes #N`; mova o card a `In review`.
5. Faça merge depois da revisão.

## Testes

| Camada | Ferramenta | Localização |
| --- | --- | --- |
| API | Jest | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine | `apps/web/src/**/*.spec.ts` |

- Testes unitários do frontend sempre devem ser browserless, usando
  ChromeHeadless e `singleRun: true` em `apps/web/karma.conf.js`.
- Evite APIs reais do navegador quando não forem essenciais; prefira mocks de
  serviços e inputs/outputs.
- Não adicione browsers reais à configuração de testes.

## Git, branches e commits

Antes de implementar, prepare a branch:

```bash
git checkout main && git pull origin main
git checkout develop 2>/dev/null || git checkout -b develop
git pull origin develop 2>/dev/null || true
git merge main
git checkout -b issue-<numero_issue>
```

- A branch da issue é exatamente `issue-<numero_issue>`.
- O fluxo normal parte de `develop` e retorna a `develop` por PR. Nunca faça
  commit direto em `main` ou `develop`.
- Em stacked PRs, crie a próxima branch a partir da anterior e aponte seu PR
  para ela. Revise e faça merge na ordem da pilha.
- Se uma base da pilha mudar, atualize as branches acima com
  `git rebase --onto <base-nova> <ponta-antiga> issue-<N>` e
  `git push --force-with-lease`; nunca use `--force` puro.
- Mantenha `develop` sincronizada com `main` antes de abrir uma nova branch.

Formato obrigatório de commit:

```text
<tipo>(#<issue>): <descrição curta no imperativo>
```

- Tipos válidos: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `style`.
- Descrição em pt-BR, imperativo, até 72 caracteres na primeira linha, sem
  ponto final. Um commit por mudança lógica.
- Não faça commit com testes falhando.

## Padrões de código e UX

- Use somente ícones de `@lucide/angular`, importando apenas os utilizados.
- Antes de todo commit, execute Prettier (`npm run format`) e ESLint
  (`npm run lint`). Não há hook de pre-commit; a formatação não é verificada
  pelo CI, mas o lint bloqueia deploy.
- Campos monetários aceitam vírgula como separador decimal e devem ser
  convertidos corretamente antes da chamada à API.

### Subscriptions Angular

- Encerre toda subscription com `takeUntilDestroyed` de
  `@angular/core/rxjs-interop`.
- Fora do contexto de injeção, passe o `DestroyRef`:
  `takeUntilDestroyed(this.destroyRef)`.
- Não crie `destroy$` nem `ngOnDestroy` apenas para limpar subscriptions.
- Para cancelar uma requisição em voo ao trocar parâmetros, use `switchMap`
  sobre um `Subject` dos parâmetros. Cancelamento de requisição e destruição
  do componente são responsabilidades distintas.

### Modais destrutivos

- Nunca use `window.confirm`, `window.alert` ou `window.prompt`.
- Confirmações de exclusão e ações destrutivas usam
  `shared/components/confirm-dialog` (`<app-confirm-dialog>`).
- Formulários modais usam `shared/components/modal` (`<app-modal>`), com
  `title`, `testId`, `maxWidth` quando necessário e tratamento de `(closed)`.
  Os botões pertencem ao formulário projetado.
- Não reimplemente o markup, `@HostListener` de Escape ou acessibilidade que os
  modais compartilhados já oferecem.

### API, erros e logs

- Para falhas de negócio, use `HttpError` de
  `apps/api/src/shared/http-error.ts` e suas fábricas (`badRequest`, `notFound`,
  `conflict`, `tooManyRequests`, `badGateway`, `internal`); não crie erros com
  `Object.assign` manualmente.
- Mensagens de erro são sempre pt-BR. Apenas `statusText` HTTP e códigos de
  contrato, como `SUBSCRIPTION_REQUIRED`, permanecem em inglês.
- O padrão de `expose` é 4xx exposto e 5xx não exposto; exponha um 5xx somente
  se sua mensagem for adequada para a tela.
- Use `logInfo`, `logWarn` e `logError` do logger estruturado, com evento e
  campos em objeto. Não use `console.log` ou `console.error` interpolados.
- Nunca registre o corpo da requisição. O middleware registra todas as
  respostas, inclusive 204 e 401.

## Segurança

- Nunca versione credenciais. `sa-key.json`, `service-account*.json` e `.env*`
  devem permanecer ignorados pelo Git.
