import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Plugin de formulários do Tailwind (issue #208)
//
// O checkbox de admin-assets usa `text-blue-600`, `focus:ring-blue-500` e
// `border-gray-300`, classes que só têm efeito sobre `input[type=checkbox]`
// com o `@tailwindcss/forms`. Sem o plugin o checkbox aparecia com o estilo
// nativo do navegador e as classes não faziam nada.
//
// A estratégia é `class` de propósito: a padrão reescreve o reset de todos os
// inputs, selects e textareas do app, que já estão estilizados à mão — trocar
// o visual de todos os formulários para consertar um checkbox seria uma
// regressão maior que o defeito.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const arquivo = (...caminho: string[]): string =>
  readFileSync(join(repoRoot, ...caminho), 'utf-8');

describe('@tailwindcss/forms', () => {
  it('deve estar declarado no workspace do frontend', () => {
    const pkg = JSON.parse(arquivo('apps', 'web', 'package.json'));

    expect(pkg.devDependencies).toHaveProperty('@tailwindcss/forms');
  });

  describe('registro no styles.css', () => {
    const estilos = (): string => arquivo('apps', 'web', 'src', 'styles.css');

    it('deve registrar o plugin', () => {
      expect(estilos()).toContain("@plugin '@tailwindcss/forms'");
    });

    it('deve usar a estratégia `class`', () => {
      expect(estilos()).toMatch(
        /@plugin\s+'@tailwindcss\/forms'[^;]*strategy:\s*class/,
      );
    });
  });
});
