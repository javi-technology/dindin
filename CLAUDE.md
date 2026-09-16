# DinDin — Diretrizes do Projeto

> Fonte das regras: `.github/copilot-instructions.md` e `.devin/rules/`. Ao alterar uma regra aqui, mantenha esses arquivos sincronizados.

## Idioma

- **Sempre responder em português do Brasil (pt-BR)**: interações, explicações, comentários, descrições de PR e mensagens de commit.

## Visão Geral

Monorepo de app financeiro pessoal. Stack: Angular 19 + Tailwind CSS 4 (frontend), Cloud Functions + Express + Node 22 (backend), Firestore, Firebase Auth/Hosting. Projeto Firebase: `dindin-4e720`.

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

#### Campos obrigatórios no GitHub Projects

Toda issue criada deve ser adicionada ao project e ter os campos abaixo preenchidos (além de `Status`, que começa em `Backlog`):

| Campo      | Valores                      | Critério                                                                                              |
| ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Estimate` | 1, 2, 3, 5, 8 (story points) | Esforço relativo (ex.: ajuste pontual = 1–2, feature ponta a ponta = 5)                               |
| `Size`     | XS, S, M, L, XL              | Tamanho da mudança (arquivos/camadas afetadas)                                                        |
| `Priority` | P0, P1, P2, P3               | P0 = incidente/bloqueante, P1 = risco financeiro ou de dados, P2 = melhoria relevante, P3 = desejável |

```bash
gh issue create --title "..." --label "..." --body-file issue.md
gh project item-add 4 --owner javi-technology --url <url_da_issue>
gh project field-list 4 --owner javi-technology           # ids dos campos e opções
gh project item-edit --project-id <project_id> --id <item_id> --field-id <estimate_id> --number <pontos>
gh project item-edit --project-id <project_id> --id <item_id> --field-id <size_id> --single-select-option-id <opcao_id>
gh project item-edit --project-id <project_id> --id <item_id> --field-id <priority_id> --single-select-option-id <opcao_id>
```

- Uma issue sem `Estimate`, `Size` e `Priority` não está pronta para ser trabalhada.

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

1. Verificar/criar issue no GitHub Projects, com `Estimate`, `Size` e `Priority` preenchidos
2. Preparar branch: `develop` → atualizar com `main` → criar `issue-<N>`
3. RED → GREEN → REFACTOR (commits `test(#N)`, `feat(#N)`, `refactor(#N)`)
4. Abrir PR de `issue-<N>` para `develop`, referenciando a issue (`Closes #N`)
5. Merge após revisão

## Testes

| Camada   | Ferramenta                | Localização                   |
| -------- | ------------------------- | ----------------------------- |
| API      | Jest                      | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine (ng test) | `apps/web/src/**/*.spec.ts`   |

### Frontend: testes unitários browserless

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

### Logs

- Erros no backend logados de forma clara (ex: `console.error` no catch dos controllers).
- Em produção, considerar logger estruturado.

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
