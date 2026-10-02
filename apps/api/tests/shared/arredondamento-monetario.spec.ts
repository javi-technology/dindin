import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// ---------------------------------------------------------------------------
// Arredondamento monetário em um lugar só (issue #507)
//
// `roundCurrency` (shared/numbers.ts, issue #302) é a regra. Cópias locais de
// `Math.round(x * 100) / 100` em seis serviços tornavam a regra um palpite por
// arquivo — e é por aí que entra o erro de centavo. Quantidade e preço são
// `number` (ponto flutuante) no modelo, então a regra precisa ser uma só.
// ---------------------------------------------------------------------------

const src = join(__dirname, '..', '..', 'src');
const numbers = join(src, 'shared', 'numbers.ts');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory()
      ? arquivos(caminho)
      : caminho.endsWith('.ts')
        ? [caminho]
        : [];
  });
}

const fontes = arquivos(src)
  .filter((arquivo) => arquivo !== numbers)
  .map((arquivo) => ({
    nome: relative(src, arquivo),
    linhas: readFileSync(arquivo, 'utf-8').split('\n'),
  }));

describe('arredondamento monetário', () => {
  it('não deve copiar Math.round(x * 100) / 100 fora do helper', () => {
    const copias = fontes.flatMap(({ nome, linhas }) =>
      linhas
        .map((linha, i) => ({ linha, n: i + 1 }))
        .filter(({ linha }) =>
          /Math\.round\(.*\*\s*100\)\s*\/\s*100/.test(linha),
        )
        .map(({ n }) => `${nome}:${n}`),
    );

    expect(copias).toEqual([]);
  });

  it('não deve declarar helper local de arredondamento a duas casas', () => {
    const locais = fontes.flatMap(({ nome, linhas }) =>
      linhas
        .map((linha, i) => ({ linha, n: i + 1 }))
        .filter(({ linha }) =>
          /(function round\w*\(|const round\w* = )/.test(linha),
        )
        .map(({ n }) => `${nome}:${n}`),
    );

    expect(locais).toEqual([]);
  });

  // Taxa por cota tem seis casas, não é valor monetário: `roundCurrency` a
  // truncaria em centavos. A exceção é deliberada e precisa dizer o porquê.
  it('deve explicar por comentário cada arredondamento de seis casas', () => {
    const semComentario = fontes.flatMap(({ nome, linhas }) =>
      linhas.flatMap((linha, i) =>
        /Math\.round\(.*1e6\)\s*\/\s*1e6/.test(linha) &&
        !linhas
          .slice(Math.max(0, i - 4), i)
          .some((anterior) => /não é valor monetário/.test(anterior))
          ? [`${nome}:${i + 1}`]
          : [],
      ),
    );

    expect(semComentario).toEqual([]);
  });
});
