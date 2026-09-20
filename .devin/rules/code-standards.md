---
description: 'Padrões de UX e código do DinDin: ícones, formatação, locale, confirmações e logs'
trigger: always_on
---

# Padrões de UX e Código

## Ícones

- Usar **@lucide/angular** (open source). Importar apenas os ícones utilizados (SVG inline, tree-shakable).

## Formatação

- Código formatado com **Prettier** (`npm run format`) antes de commitar.
- Código analisado com **ESLint** (`npm run lint`) antes de commitar. Flat config:
  `eslint.config.mjs` na raiz (api e packages) e `apps/web/eslint.config.mjs`
  (angular-eslint, incluindo regras de template `.html`).
- **Não há hook de pre-commit**: rodar `npm run format` e `npm run lint`
  manualmente antes de cada commit.
- O job `lint` do CI bloqueia o deploy. A formatação **não** é verificada no CI,
  então depende de rodar o Prettier antes do commit.

## Locale Brasileiro em Campos Numéricos

- Campos de preço/valor monetário devem aceitar vírgula como separador decimal (ex: `1,55`, `0,95`).
- Fazer parse correto desses valores para número antes de enviar à API.

## Confirmação de Ações Destrutivas

- **Não usar** `window.confirm`, `window.alert` ou `window.prompt` nativos.
- Sempre usar **modal customizado** para confirmação de exclusão ou ações destrutivas.
- Para confirmação, usar o componente compartilhado
  `shared/components/confirm-dialog` (`<app-confirm-dialog>`), que já traz
  `role="dialog"`, `aria-modal`, fechamento por `Esc` e clique no fundo, foco
  preso enquanto aberto e devolvido ao gatilho ao fechar. Não reimplementar o
  markup do modal na feature.

## Erros da API

- Falha de negócio é sinalizada com **`HttpError`** (`apps/api/src/shared/http-error.ts`),
  nunca com `Object.assign(new Error(...), { statusCode })` à mão: use as
  fábricas `badRequest`, `notFound`, `conflict`, `tooManyRequests`,
  `badGateway` e `internal`.
- `expose` segue o padrão da classe: 4xx expõe a mensagem, 5xx não.
- **Mensagens de erro sempre em português (pt-BR)**. Ficam em inglês apenas o
  `statusText` do HTTP e códigos de contrato, como `code: 'SUBSCRIPTION_REQUIRED'`.

## Logs

- Erros no backend logados de forma clara (ex: `console.error` no catch dos controllers).
- Em produção, considerar logger estruturado.

## Subscriptions em Componentes

- Encerrar toda subscription com **`takeUntilDestroyed`** (`@angular/core/rxjs-interop`).
  Fora de contexto de injeção, passar o `DestroyRef`: `takeUntilDestroyed(this.destroyRef)`.
- **Não** criar `Subject` de destruição (`destroy$`) nem `ngOnDestroy` só para
  limpar subscription: esquecer o `next()` vaza sem erro de compilação ou teste.
- Para **cancelar requisição em voo** (ex.: trocar de carteira antes da resposta
  chegar), usar `switchMap` sobre um `Subject` do parâmetro, não um `Subject` de
  abort manual. Cancelamento e destruição são preocupações diferentes.
