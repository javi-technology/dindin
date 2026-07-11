# AGENTS.md — Modelo de trabalho do DinDin

## 1. Vínculo obrigatório com Issues

**Toda implementação deve estar vinculada a uma issue do GitHub Projects.**

- Projeto: https://github.com/orgs/javi-technology/projects/4
- Antes de iniciar qualquer trabalho, verificar se existe uma issue aberta para a tarefa.
- Se não existir, criar a issue antes de começar.
- Nenhum commit pode ser feito sem o número da issue correspondente.

---

## 2. Fluxo de desenvolvimento — TDD estrito (Red → Green → Refactor)

Todo desenvolvimento segue obrigatoriamente o ciclo TDD. Não há exceção.

### Ciclo obrigatório

```
1. RED    — Escrever o teste que descreve o comportamento esperado. Rodar e confirmar que falha.
2. GREEN  — Escrever o mínimo de código necessário para o teste passar. Rodar e confirmar que passa.
3. REFACTOR — Refatorar o código (e os testes, se necessário) sem quebrar os testes.
```

### Regras TDD

- Nunca escrever código de produção antes de ter um teste falhando.
- Nunca escrever mais código do que o necessário para o teste passar.
- O commit do RED e do GREEN pode ser feito no mesmo commit final da tarefa, desde que os testes passem.
- Testes devem ser mantidos junto ao código que testam (co-location).

### Estrutura de testes

| Camada   | Ferramenta                | Localização                   |
| -------- | ------------------------- | ----------------------------- |
| API      | Jest                      | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine (ng test) | `apps/web/src/**/*.spec.ts`   |
| E2E      | (a definir)               | -                             |

### Comandos de teste

```bash
# API (Jest)
npm run test --workspace=apps/api

# Frontend (Karma)
npm run test --workspace=apps/web
```

---

## 3. Padrão de commits

**Todo commit deve ser semântico, objetivo e conter o número da issue.**

### Formato

```
<tipo>(#<issue>): <descrição curta no imperativo>
```

### Tipos aceitos

| Tipo       | Quando usar                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | Nova funcionalidade                                   |
| `fix`      | Correção de bug                                       |
| `test`     | Adição ou ajuste de testes                            |
| `refactor` | Refatoração sem mudança de comportamento              |
| `chore`    | Tarefas de infraestrutura, configuração, dependências |
| `docs`     | Documentação                                          |
| `style`    | Formatação, lint (sem mudança de lógica)              |

### Exemplos

```
feat(#12): adiciona endpoint GET /api/wallet
test(#12): adiciona testes do endpoint GET /api/wallet
fix(#15): corrige cálculo de total da carteira
refactor(#12): extrai lógica de carteira para WalletService
chore(#3): configura Jest na API
```

### Regras de commit

- Descrição em português, no imperativo ("adiciona", "corrige", "remove").
- Máximo de 72 caracteres na primeira linha.
- Sem ponto final na primeira linha.
- Commits atômicos: um commit por mudança lógica, não por arquivo.
- Nunca commitar código com testes falhando.

---

## 4. Fluxo completo de uma tarefa

### 4.1. Preparação da branch

Antes de iniciar qualquer implementação, executar **sempre** os passos abaixo:

```bash
# 1. Garantir que está na main atualizada
git checkout main
git pull origin main

# 2. Criar ou atualizar a branch develop
git checkout develop 2>/dev/null || git checkout -b develop
git pull origin develop 2>/dev/null || true
git merge main

# 3. Criar a branch da issue a partir da develop
git checkout -b issue-<numero_issue>
```

**Exemplo:** para a issue #3, a branch deve ser `issue-3`.

### 4.2. Ciclo de desenvolvimento

```
1. Verificar/criar issue no GitHub Projects
2. Preparar branch: checkout develop → atualizar com main → criar issue-<N>
3. RED:      escrever teste → confirmar falha → commit test(#N): ...
4. GREEN:    escrever código → confirmar que passa → commit feat(#N): ...
5. REFACTOR: refatorar → confirmar que passa → commit refactor(#N): ... (se houver)
6. Abrir PR da branch issue-<N> para develop, referenciando a issue (Closes #N)
7. Merge após revisão
8. (Opcional) Sincronizar develop e main quando acordado
```

### 4.3. Regras de branch

- Toda implementação parte da `develop` e retorna para `develop` via PR.
- Nome da branch deve ser **exatamente** `issue-<numero_issue>`.
- A `develop` deve estar sempre sincronizada com a `main` antes de criar uma nova branch.
- Nunca commitar diretamente na `main` ou na `develop`.

---

## 5. Comandos do projeto

```bash
# Instalar todas as dependências
npm install

# Rodar emuladores locais (Hosting :5002, Functions :5001, Firestore :8080, Auth :9099)
firebase emulators:start

# Build da API
npm run api:build --workspace=apps/api

# Build do frontend
npm run build --workspace=apps/web

# Testes da API
npm run test --workspace=apps/api

# Testes do frontend
npm run test --workspace=apps/web

# Deploy completo
firebase deploy
```

---

## 6. Stack

| Camada           | Tecnologia                          |
| ---------------- | ----------------------------------- |
| Frontend         | Angular 19 + Tailwind CSS 3         |
| Backend          | Cloud Functions + Express + Node 22 |
| Banco de dados   | Firestore                           |
| Autenticação     | Firebase Authentication             |
| Hospedagem       | Firebase Hosting                    |
| Monorepo         | npm workspaces                      |
| Projeto Firebase | `dindin-4e720`                      |

---

## 7. Estrutura do repositório

```
dindin/
├── apps/
│   ├── api/              # Cloud Functions (Express + TypeScript)
│   │   └── src/
│   │       └── index.ts
│   └── web/              # Angular + Tailwind
│       └── src/
│           └── app/
│               ├── core/       # auth, interceptors, guards, serviços globais
│               ├── features/   # wallet, fridge, dashboard (um módulo por feature)
│               └── shared/     # componentes, pipes e utilitários reutilizáveis
├── packages/
│   └── shared-types/     # Interfaces TypeScript compartilhadas entre web e api
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── AGENTS.md             # este arquivo
```
