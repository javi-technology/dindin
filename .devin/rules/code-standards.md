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
- Para **modal de formulário**, usar `shared/components/modal`
  (`<app-modal>`), que traz as mesmas garantias e projeta o formulário com
  `<ng-content>`. A feature informa `title`, `testId` e, quando precisar,
  `maxWidth`, e reage a `(closed)`. O rodapé com os botões pertence ao
  formulário projetado, porque só ele sabe quando o envio é válido.
- Com o modal compartilhado, a feature **não** declara `@HostListener` de
  `Escape`: quem escuta o teclado é o modal.

## Erros da API

- Falha de negócio é sinalizada com **`HttpError`** (`apps/api/src/shared/http-error.ts`),
  nunca com `Object.assign(new Error(...), { statusCode })` à mão: use as
  fábricas `badRequest`, `notFound`, `conflict`, `tooManyRequests`,
  `badGateway` e `internal`.
- `expose` segue o padrão da classe: 4xx expõe a mensagem, 5xx não.
- **Mensagens de erro sempre em português (pt-BR)**. Ficam em inglês apenas o
  `statusText` do HTTP e códigos de contrato, como `code: 'SUBSCRIPTION_REQUIRED'`.

## Logs

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

## Subscriptions em Componentes

- Encerrar toda subscription com **`takeUntilDestroyed`** (`@angular/core/rxjs-interop`).
  Fora de contexto de injeção, passar o `DestroyRef`: `takeUntilDestroyed(this.destroyRef)`.
- **Não** criar `Subject` de destruição (`destroy$`) nem `ngOnDestroy` só para
  limpar subscription: esquecer o `next()` vaza sem erro de compilação ou teste.
- Para **cancelar requisição em voo** (ex.: trocar de carteira antes da resposta
  chegar), usar `switchMap` sobre um `Subject` do parâmetro, não um `Subject` de
  abort manual. Cancelamento e destruição são preocupações diferentes.
