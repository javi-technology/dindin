import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Responsável pela issue em andamento (PR #576)
//
// O card em `In progress` dizia o que estava sendo feito, mas não por quem: a
// issue ficava sem assignee e o board não mostrava de quem era cada trabalho.
// Quem move o card para `In progress` passa a se atribuir à issue.
// ---------------------------------------------------------------------------

const guia = readFileSync(
  join(__dirname, '..', '..', '..', 'AGENTS.md'),
  'utf-8',
);
const secao = (inicio: string, fim: string): string =>
  guia.slice(guia.indexOf(inicio), guia.indexOf(fim));

describe('responsável pela issue em andamento', () => {
  const comando = 'gh issue edit <N> --add-assignee @me';

  it('deve atribuir a issue a quem a move para In progress', () => {
    const status = secao(
      '#### Status do card no GitHub Projects',
      '### TDD Estrito',
    );

    expect(status).toMatch(/In progress.*assignee/s);
    expect(status).toContain(comando);
  });

  it('deve incluir a atribuição no fluxo completo de tarefa', () => {
    const fluxo = secao('### Fluxo Completo de Tarefa', '### Jev (TypeSafe)');

    expect(fluxo).toMatch(/Status: In progress`?.*assignee/s);
  });
});
