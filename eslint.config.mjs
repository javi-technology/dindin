// @ts-check
import tseslint from 'typescript-eslint';

/**
 * Config base do monorepo (issue #220).
 *
 * Vale para `apps/api` e `packages/*`: o ESLint procura o flat config no cwd
 * e sobe os diretórios até achar, então rodar `eslint` dentro de `apps/api`
 * cai aqui. O `apps/web` tem o seu próprio `eslint.config.mjs`, que sombreia
 * este por estar mais perto, porque precisa das regras do angular-eslint.
 *
 * Começa no conjunto `recommended`. Regras mais rígidas que exigem informação
 * de tipo (`no-floating-promises`, `no-misused-promises`) entram numa issue
 * própria, para esta não virar refatoração em massa.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/.firebase/**',
      'apps/web/**', // tem config próprio; evita lint duplicado a partir da raiz
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Erro em produção, mas `_` como prefixo marca parâmetro intencionalmente
      // não usado — padrão já presente no código (ex.: `_next` no Express).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Os testes usam helpers de mock que às vezes precisam de asserção de tipo
    // para simular payloads inválidos vindos da rede.
    files: ['**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
