# Testes

## Testes unitários do frontend devem ser browserless

Os testes unitários do frontend (`apps/web/src/**/*.spec.ts`) devem rodar sem depender de um navegador interativo. Isso garante:

- execução rápida e determinística em CI;
- compatibilidade com ambientes sem interface gráfica;
- foco em lógica e comportamento de componentes, não em integração com DOM real.

### Configuração

O projeto usa **Karma + Jasmine** com **ChromeHeadless** (`apps/web/karma.conf.js`). O browser é executado em modo headless, sem janela visível.

```javascript
browsers: ['ChromeHeadless'],
singleRun: true,
```

### Boas práticas

- Evite testes que dependam de APIs específicas de navegador (`window`, `document`, `setTimeout` reais) quando não forem essenciais.
- Prefira mockar serviços e inputs/outputs de componentes em vez de disparar eventos reais do DOM.
- Não adicione dependências de browsers reais (Chrome, Firefox, Safari) na configuração de testes.

## Localização dos testes

| Camada   | Ferramenta      | Localização                   |
| -------- | --------------- | ----------------------------- |
| API      | Jest            | `apps/api/tests/**/*.spec.ts` |
| Frontend | Karma + Jasmine | `apps/web/src/**/*.spec.ts`   |
