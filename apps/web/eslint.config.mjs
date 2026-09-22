// @ts-check
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

/**
 * Config do frontend (issue #220).
 *
 * Fica separada da raiz porque o Angular precisa de dois processadores: o
 * TypeScript dos componentes e o parser de template do angular-eslint para os
 * `.html`. O bloco de `.ts` declara `processInlineTemplates` para que
 * templates inline também sejam analisados pelas regras de template.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', 'dist/**', '.angular/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {
      // `x != null` é o idioma proposital para "nem null nem undefined" e é
      // usado nos templates para decidir se há cotação. Trocar por `!== null`
      // mudaria o comportamento: `undefined !== null` é true, e um preço
      // ausente passaria a ser formatado. A regra segue valendo para o resto.
      '@angular-eslint/template/eqeqeq': [
        'error',
        { allowNullOrUndefined: true },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Adaptador transitório para manter os testes Jasmine legados executáveis
    // durante a migração para Vitest. Os tipos dinâmicos são inerentes à API
    // global que ele reproduz e não devem se propagar para o código do app.
    files: ['src/test-setup.ts', 'src/jasmine.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
