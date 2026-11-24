import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Fontes de dados de mercado (issues #598 a #601)
//
// Com o cancelamento do plano Pro da Brapi, a cotação diária passou para o
// Yahoo Finance, o fechamento oficial para o COTAHIST da B3, os proventos
// para a B3 Listados e a Brapi ficou como reserva no plano gratuito, que
// aceita um ticker por chamada. Configuração do plano Pro esquecida no
// repositório engana: religar um lote de 20 derrubaria a reserva.
// ---------------------------------------------------------------------------

const raiz = join(__dirname, '..', '..', '..');
const ler = (...partes: string[]): string =>
  readFileSync(join(raiz, ...partes), 'utf-8');

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

describe('fontes de dados de mercado', () => {
  const codigoDaApi = arquivosTs(join(raiz, 'apps', 'api', 'src'))
    .map((arquivo) => readFileSync(arquivo, 'utf-8'))
    .join('\n');

  it('não deve consultar os endpoints de proventos do plano pago da Brapi', () => {
    expect(codigoDaApi).not.toContain('/api/v2/fii/dividends');
    expect(codigoDaApi).not.toContain('/api/v2/stocks/dividends');
  });

  it.each([
    ['código da API', () => codigoDaApi],
    ['.env.example', () => ler('apps', 'api', '.env.example')],
    ['workflow de CI/CD', () => ler('.github', 'workflows', 'ci-cd.yml')],
  ])(
    'não deve configurar o lote de tickers do plano Pro (%s)',
    (_nome, conteudo) => {
      expect(conteudo()).not.toContain('BRAPI_MAX_SYMBOLS_PER_REQUEST');
    },
  );

  it('deve manter a chave da Brapi, usada pela reserva de cotação', () => {
    expect(ler('apps', 'api', '.env.example')).toContain('BRAPI_API_KEY');
  });

  describe('AGENTS.md', () => {
    const guia = ler('AGENTS.md');
    const inicio = guia.indexOf('### Fontes de dados de mercado');
    const secao = guia.slice(inicio, guia.indexOf('\n### ', inicio + 1));

    it('deve ter a seção das fontes de dados de mercado', () => {
      expect(inicio).toBeGreaterThan(-1);
    });

    it.each(['Yahoo', 'COTAHIST', 'B3 Listados', 'Brapi', 'ISIN'])(
      'deve citar %s na seção',
      (termo) => {
        expect(secao).toContain(termo);
      },
    );
  });
});
