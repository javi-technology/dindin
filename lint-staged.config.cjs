/**
 * Tarefas do lint-staged (issue #220).
 *
 * Duas armadilhas moldam este arquivo:
 *
 * 1. Globs que alcançam o mesmo arquivo rodam em paralelo. Com `*.ts` no glob
 *    do Prettier e em outro do ESLint, os dois reescreviam o mesmo arquivo ao
 *    mesmo tempo e a gravação mais lenta descartava a outra. Por isso cada
 *    extensão cai em um único glob, e dentro dele os comandos rodam em ordem:
 *    ESLint corrige, Prettier formata por último.
 *
 * 2. O lint-staged roda da raiz, e o ESLint 9 procura o flat config a partir do
 *    diretório de execução, não do arquivo. A config da raiz ignora `apps/web`,
 *    então os arquivos do frontend precisam da config do web explicitamente.
 *
 * Por serem funções, as tarefas não cabem no `package.json`.
 */

const WEB_DIR = `${__dirname}/apps/web/`;
const WEB_ESLINT = 'eslint --fix --config apps/web/eslint.config.mjs';

const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');

module.exports = {
  '*.{js,jsx,tsx,json,md,css,scss,yml,yaml}': (files) =>
    `prettier --write ${quote(files)}`,

  '*.{ts,html}': (files) => {
    const web = files.filter((file) => file.startsWith(WEB_DIR));
    // Fora do web só há TypeScript para o ESLint; `.html` avulso só formata.
    const rootTs = files.filter(
      (file) => !file.startsWith(WEB_DIR) && file.endsWith('.ts'),
    );

    return [
      ...(web.length > 0 ? [`${WEB_ESLINT} ${quote(web)}`] : []),
      ...(rootTs.length > 0 ? [`eslint --fix ${quote(rootTs)}`] : []),
      `prettier --write ${quote(files)}`,
    ];
  },
};
