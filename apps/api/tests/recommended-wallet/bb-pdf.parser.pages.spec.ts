import { parseBbFiiPdf } from '../../src/recommended-wallet/bb-pdf.parser';
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
