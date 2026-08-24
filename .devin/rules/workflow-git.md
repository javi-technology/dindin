---
description: "Fluxo de trabalho obrigatório: issues, TDD estrito, branches e commits"
trigger: always_on
---

# Fluxo de Trabalho Obrigatório

## Vínculo com Issues

- **Toda implementação deve estar vinculada a uma issue do GitHub Projects** (https://github.com/orgs/javi-technology/projects/4).
- Antes de iniciar qualquer trabalho, verificar se existe issue aberta. Se não existir, criar.
- Nenhum commit sem o número da issue correspondente.

## TDD Estrito (Red → Green → Refactor)

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
| -------- | ------------------------- | ------------------------------ |
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
