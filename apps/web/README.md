# DinDin — Frontend

Aplicação Angular 22 com Tailwind CSS 4 do DinDin. As diretrizes do projeto
estão no [`CLAUDE.md`](../../CLAUDE.md), na raiz do monorepo — este README cobre
só o que é específico deste workspace.

## Estrutura

```
src/app/
  core/      # serviços, guards e interceptors de uso geral
  features/  # uma pasta por tela (wallet, fridge, billing, admin-*)
  shared/    # componentes reutilizáveis (modal, confirm-dialog) e utilitários
```

## Comandos

Rode da raiz do monorepo:

```bash
npm run web:serve                            # servidor de desenvolvimento
npm run build --workspace=apps/web           # build de produção
npm run test --workspace=apps/web            # testes (Vitest + jsdom)
npm run test:coverage --workspace=apps/web   # testes com cobertura
npm run lint                                 # ESLint (inclui templates .html)
```

O app conversa com a API pelo prefixo `/api`. Para rodar com backend local, use
`firebase emulators:start` na raiz: o Hosting sobe em `:5002` e faz o rewrite
para as Functions em `:5001`.

## Testes

Os testes unitários rodam **sem navegador**, em Node com jsdom — um teste que
exija janela real não entra no projeto. Prefira mockar serviços e inputs de
componente a disparar eventos de DOM.
