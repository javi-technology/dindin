import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Budget do bundle inicial do frontend (issue #258)
//
// O budget de aviso era de 700 kB e o bundle vivia acima dele: o aviso virou
// ruído de build, ignorado a cada deploy. Com as rotas carregando sob demanda
// o inicial caiu para ~465 kB, e um teto de 700 kB deixaria 50% de folga —
// espaço para uma regressão inteira passar sem ninguém notar.
//
// O aviso passa a 500 kB, perto do tamanho real, e o erro a 700 kB. Este teste
// existe para que afrouxar o teto seja uma decisão explícita, não um ajuste
// silencioso de config quando o build reclamar.
//
// Revisado na issue #394: o seletor de tema fica no `app.component`, sempre
// visível, e com ele o `@lucide/angular` entrou no bundle inicial pela
// primeira vez — antes a biblioteca só vinha por rota preguiçosa. O inicial
// foi de ~467 kB para ~546 kB. O custo foi aceito em vez de trocar os ícones
// por SVG inline, e o aviso sobe para 560 kB, de novo perto do tamanho real.
// O teto de erro segue em 700 kB.
//
// Os valores são exatos de propósito: mexer no teto, para cima ou para baixo,
// passa por aqui.
// ---------------------------------------------------------------------------

const repoRoot = join(__dirname, '..', '..', '..');

interface Budget {
  type: string;
  maximumWarning?: string;
  maximumError?: string;
}

function budgetInicial(): Budget {
  const angular = JSON.parse(
    readFileSync(join(repoRoot, 'apps', 'web', 'angular.json'), 'utf-8'),
  );
  const budgets: Budget[] =
    angular.projects['dindin-web'].architect.build.configurations.production
      .budgets;
  const inicial = budgets.find((budget) => budget.type === 'initial');

  if (!inicial) {
    throw new Error('Nenhum budget do tipo `initial` no angular.json.');
  }

  return inicial;
}

/** Converte "500kB" em 500. */
function emKb(valor: string): number {
  return (
    Number(valor.replace(/kB$/i, '').replace(/MB$/i, '')) *
    (/MB$/i.test(valor) ? 1024 : 1)
  );
}

describe('budget do bundle inicial', () => {
  it('deve avisar a partir de 560 kB', () => {
    expect(emKb(budgetInicial().maximumWarning!)).toBe(560);
  });

  it('deve falhar a partir de 700 kB', () => {
    expect(emKb(budgetInicial().maximumError!)).toBe(700);
  });
});
