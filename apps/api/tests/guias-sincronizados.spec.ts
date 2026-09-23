import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Sincronia entre os guias de diretrizes (issues #321 e #322)
//
// O repositório mantém quatro guias com as mesmas regras, um por agente. A
// seção de deploy nasceu só no CLAUDE.md e no AGENTS.md: quem seguia o
// GEMINI.md ou o copilot-instructions.md não sabia que regras e índices do
// Firestore passaram a ser publicados pelo CI, nem por que o passo roda sem
// `--force`. Regra documentada pela metade é regra que alguém quebra sem saber.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

const GUIAS = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
];

/** Trechos que toda cópia da seção de deploy precisa conter. */
const REGRAS_DE_DEPLOY = [
  '## Deploy',
  'regras e índices do Firestore',
  // Específico do passo de deploy: `--force` sozinho também aparece na
  // regra de `git push --force-with-lease`.
  'roda **sem `--force`**',
  'apps/api/tests/rules/',
  // Issue #322: sem essas duas variáveis e sem `id-token: write` o deploy não
  // autentica, e a chave JSON de longa duração deixou de existir.
  'Workload Identity Federation',
  '`id-token: write`',
  'docs/deploy-workload-identity.md',
];

describe('guias de diretrizes', () => {
  const conteudo = (guia: string): string =>
    readFileSync(join(repoRoot, guia), 'utf-8');

  describe.each(GUIAS)('%s', (guia) => {
    it.each(REGRAS_DE_DEPLOY)('deve documentar %s', (trecho) => {
      expect(conteudo(guia)).toContain(trecho);
    });
  });
});
