# DinDin — Diretrizes do Projeto

## Visão Geral

Monorepo de app financeiro pessoal. Stack: Angular 19 + Tailwind CSS 3 (frontend), Cloud Functions + Express + Node 22 (backend), Firestore, Firebase Auth/Hosting. Projeto Firebase: `dindin-4e720`.

## Fluxo de Trabalho Obrigatório

### Vínculo com Issues

- **Toda implementação deve estar vinculada a uma issue do GitHub Projects** (https://github.com/orgs/javi-technology/projects/4).
- Antes de iniciar qualquer trabalho, verificar se existe issue aberta. Se não existir, criar.
- Nenhum commit sem o número da issue correspondente.

### TDD Estrito (Red → Green → Refactor)

Todo desenvolvimento segue TDD. Não há exceção.

1. **RED** — Escrever teste que descreve o comportamento esperado. Rodar e confirmar que falha.
2. **GREEN** — Escrever o mínimo de código para o teste passar. Rodar e confirmar que passa.
3. **REFACTOR** — Refatorar sem quebrar os testes.

Regras:
- Nunca escrever código de produção antes de ter um teste falhando.
- Nunca escrever mais código do que o necessário para o teste passar.
- Testes mantidos junto ao código que testam (co-location).

### Estrutura de Testes

| Camada   | Ferramenta                | Localização                   |
| -------- | ------------------------- | ----------------------------- |
| API      | Jest                      | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine (ng test) | `apps/web/src/**/*.spec.ts`   |

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
- Descrição em português, no imperativo ("adiciona", "corrige", "remove").
- Máximo 72 caracteres na primeira linha. Sem ponto final.
- Commits atômicos: um commit por mudança lógica.
- Nunca commitar com testes falhando.

### Fluxo Completo de Tarefa

1. Verificar/criar issue no GitHub Projects
2. Preparar branch: `develop` → atualizar com `main` → criar `issue-<N>`
3. RED → GREEN → REFACTOR (commits `test(#N)`, `feat(#N)`, `refactor(#N)`)
4. Abrir PR de `issue-<N>` para `develop`, referenciando a issue (`Closes #N`)
5. Merge após revisão

## Comandos

```bash
npm install                                    # instalar dependências
firebase emulators:start                       # emuladores (Hosting :5002, Functions :5001, Firestore :8080, Auth :9099)
npm run api:build --workspace=apps/api         # build da API
npm run build --workspace=apps/web             # build do frontend
npm run test --workspace=apps/api              # testes da API (Jest)
npm run test --workspace=apps/web              # testes do frontend (Karma)
npm run format                                # formatar com Prettier
npm run format:check                          # verificar formatação
firebase deploy                               # deploy completo
```

## Estrutura do Repositório

```
apps/
  api/    # Cloud Functions (Express + TypeScript) — src/ e tests/
  web/    # Angular + Tailwind — src/app/{core,features,shared}/
packages/
  models/        # Models do Firestore (User, Wallet, Position, Fridge, FridgeItem)
  shared-types/  # Tipos compartilhados (ex: HealthResponse)
```

## Padrões de UX e Código

### Ícones

- Usar **@lucide/angular** (open source). Importar apenas os ícones utilizados (SVG inline, tree-shakable).

### Formatação

- Código formatado com **Prettier** antes de commitar.
- **husky** + **lint-staged** rodam Prettier no hook `pre-commit`.

### Locale Brasileiro em Campos Numéricos

- Campos de preço/valor monetário devem aceitar vírgula como separador decimal (ex: `1,55`, `0,95`).
- Fazer parse correto desses valores para número antes de enviar à API.

### Confirmação de Ações Destrutivas

- **Não usar** `window.confirm`, `window.alert` ou `window.prompt` nativos.
- Sempre usar **modal customizado** para confirmação de exclusão ou ações destrutivas.

### Logs

- Erros no backend logados de forma clara (ex: `console.error` no catch dos controllers).
- Em produção, considerar logger estruturado.

<!-- rtk-instructions v2 -->
# RTK — Token-Optimized CLI

**rtk** is a CLI proxy that filters and compresses command outputs, saving 60-90% tokens.

## Rule

Always prefix shell commands with `rtk`:

```bash
# Instead of:              Use:
git status                 rtk git status
git log -10                rtk git log -10
cargo test                 rtk cargo test
docker ps                  rtk docker ps
kubectl get pods           rtk kubectl pods
```

## Meta commands (use directly)

```bash
rtk gain              # Token savings dashboard
rtk gain --history    # Per-command savings history
rtk discover          # Find missed rtk opportunities
rtk proxy <cmd>       # Run raw (no filtering) but track usage
```
<!-- /rtk-instructions -->

## Idioma do Agente

- **Sempre responder em português do Brasil (pt-BR)**. Todas as interações, explicações e comentários devem ser feitos neste idioma.