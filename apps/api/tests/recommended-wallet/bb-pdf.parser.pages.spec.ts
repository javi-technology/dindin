import {
  parseBbFiiPdf,
  parseWalletChanges,
} from '../../src/recommended-wallet/bb-pdf.parser';
import { logWarn } from '../../src/shared/logger';

jest.mock('../../src/shared/logger');

const mockGetText = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(() => ({
    getText: mockGetText,
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

const pagina = (titulo: string, tickers: string[]) =>
  [
    titulo,
    'Fundos Recomendados',
    ...tickers.map((ticker) => `25,00% ${ticker} Papel 1,00% 2,00 R$ 10,00`),
  ].join('\n');

describe('bb-pdf.parser: identificação das páginas', () => {
  it('deve avisar e devolver Ganho vazio quando o PDF só tem uma tabela', async () => {
    const text = pagina('Carteira Renda', [
      'GARE11',
      'KNHF11',
      'HGCR11',
      'KNCR11',
    ]);
    mockGetText.mockResolvedValue({ text, pages: [{ text }] });

    const result = await parseBbFiiPdf(Buffer.from('pdf'));

    expect(result.renda).toHaveLength(4);
    expect(result.ganho).toEqual([]);
    expect(logWarn).toHaveBeenCalledWith('parseBbFiiPdf.ganhoPageMissing');
  });
});

describe('bb-pdf.parser: conferência das entradas e saídas (issue #586)', () => {
  const renda = ['AAAA11', 'BBBB11'];
  const ganho = ['CCCC11', 'DDDD11'];
  const pagina = (...linhas: string[]) =>
    ['Carteira Renda - Novembro', 'Carteira Ganho - Novembro', ...linhas].join(
      '\n',
    );

  beforeEach(() => jest.clearAllMocks());

  it('identifica a carteira pela tabela, nunca pela ordem do texto', () => {
    expect(
      parseWalletChanges(
        [
          pagina(
            'Sai: XXXX11 (agro)',
            'Entra: CCCC11 (logístico)',
            'Entra: AAAA11 (papel)',
            'Sai: YYYY11 (papel)',
          ),
        ],
        renda,
        ganho,
      ),
    ).toEqual({
      renda: { entering: ['AAAA11'], leaving: ['YYYY11'] },
      ganho: { entering: ['CCCC11'], leaving: ['XXXX11'] },
    });
  });

  it('lê o fundo que continua na linha seguinte', () => {
    expect(
      parseWalletChanges(
        [
          pagina(
            'Sai: XXXX11 (agro) e',
            'YYYY11 (papel)',
            'Entra: AAAA11 (papel) e BBBB11',
            '(papel)',
          ),
        ],
        renda,
        [],
      ),
    ).toEqual({
      renda: { entering: ['AAAA11', 'BBBB11'], leaving: ['XXXX11', 'YYYY11'] },
    });
  });

  it('não lê os blocos fora da página da composição', () => {
    expect(
      parseWalletChanges(
        ['Sai: XXXX11 (agro)\nEntra: AAAA11 (papel)'],
        renda,
        ganho,
      ),
    ).toBeUndefined();
  });

  it('descarta o bloco cujo fundo que entra não está em nenhuma tabela', () => {
    expect(
      parseWalletChanges(
        [
          pagina(
            'Sai: XXXX11 (agro)',
            'Entra: ZZZZ11 (papel)',
            'Sem alterações',
          ),
        ],
        renda,
        ganho,
      ),
    ).toBeUndefined();
    expect(logWarn).toHaveBeenCalledWith(
      'parseWalletChanges.blockDiscarded',
      expect.objectContaining({ entering: ['ZZZZ11'] }),
    );
  });

  it('descarta o bloco cujo fundo que sai continua na tabela da carteira', () => {
    expect(
      parseWalletChanges(
        [pagina('Sai: BBBB11 (agro)', 'Entra: AAAA11 (papel)')],
        renda,
        ganho,
      ),
    ).toBeUndefined();
    expect(logWarn).toHaveBeenCalled();
  });

  it('não pareia os blocos quando a sequência não é de pares', () => {
    expect(
      parseWalletChanges(
        [pagina('Sai: XXXX11 (agro)', 'Sai: YYYY11 (papel)', 'Entra: AAAA11')],
        renda,
        ganho,
      ),
    ).toBeUndefined();
    expect(logWarn).toHaveBeenCalledWith(
      'parseWalletChanges.unpairedBlocks',
      expect.anything(),
    );
  });

  it('com as duas carteiras em "Sem alterações", informa as duas sem mudança', () => {
    expect(
      parseWalletChanges(
        [pagina('Sem alterações', 'Sem alterações')],
        renda,
        ganho,
      ),
    ).toEqual({
      renda: { entering: [], leaving: [] },
      ganho: { entering: [], leaving: [] },
    });
  });

  it('com um só "Sem alterações" e nenhum bloco, não adivinha a carteira', () => {
    expect(
      parseWalletChanges([pagina('Sem alterações')], renda, ganho),
    ).toBeUndefined();
  });
});
