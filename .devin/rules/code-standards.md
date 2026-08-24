---
description: 'Padrões de UX e código do DinDin: ícones, formatação, locale, confirmações e logs'
trigger: always_on
---

# Padrões de UX e Código

## Ícones

- Usar **@lucide/angular** (open source). Importar apenas os ícones utilizados (SVG inline, tree-shakable).

## Formatação

- Código formatado com **Prettier** antes de commitar.
- **husky** + **lint-staged** rodam Prettier no hook `pre-commit`.

## Locale Brasileiro em Campos Numéricos

- Campos de preço/valor monetário devem aceitar vírgula como separador decimal (ex: `1,55`, `0,95`).
- Fazer parse correto desses valores para número antes de enviar à API.

## Confirmação de Ações Destrutivas

- **Não usar** `window.confirm`, `window.alert` ou `window.prompt` nativos.
- Sempre usar **modal customizado** para confirmação de exclusão ou ações destrutivas.

## Logs

- Erros no backend logados de forma clara (ex: `console.error` no catch dos controllers).
- Em produção, considerar logger estruturado.
