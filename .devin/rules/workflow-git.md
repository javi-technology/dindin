---
description: 'Fluxo de trabalho obrigatório: issues, TDD estrito, branches e commits'
trigger: always_on
---

# Fluxo de Trabalho Obrigatório

## Vínculo com Issues

- **Toda implementação deve estar vinculada a uma issue do GitHub Projects** (https://github.com/orgs/javi-technology/projects/4).
- Antes de iniciar qualquer trabalho, verificar se existe issue aberta. Se não existir, criar.
- Nenhum commit sem o número da issue correspondente.

### Template obrigatório

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

### Campos obrigatórios no GitHub Projects

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

### Status do card no GitHub Projects

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

- Descrição em português, no imperativo ("adiciona", "corrige", "remove").
- Máximo 72 caracteres na primeira linha. Sem ponto final.
- Commits atômicos: um commit por mudança lógica.
- Nunca commitar com testes falhando.

### Fluxo Completo de Tarefa

1. Verificar/criar issue no GitHub Projects, com `Estimate`, `Size` e `Priority` preenchidos → `Status: Ready`
2. Preparar branch: `develop` → atualizar com `main` → criar `issue-<N>` (em stacked PR, a partir da branch anterior da pilha) → `Status: In progress`
3. RED → GREEN → REFACTOR (commits `test(#N)`, `feat(#N)`, `refactor(#N)`)
4. Abrir PR de `issue-<N>` para `develop` (em stacked PR, para a branch anterior da pilha), referenciando a issue (`Closes #N`) → `Status: In review`
5. Merge após revisão
