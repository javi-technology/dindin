import { readFileSync } from 'fs';
import { join } from 'path';
import {
  bbFileName,
  parseBbFileName,
  parseBbFiiPdf,
  parseRendaTable,
} from '../../src/recommended-wallet/bb-pdf.parser';

describe('bb-pdf.parser', () => {
  describe('parseRendaTable', () => {
    it('deve extrair as linhas da carteira Renda e converter números pt-BR', () => {
      const rows = parseRendaTable(
        [
          'RZTR11Agronegócio1,07%R$ 88,0412,50%',
          'GARE11Outro2,00%R$ 9,9912,50%',
          'TRXF11Varejo3,00%R$ 10,0012,50%',
          'KNHF11Papel4,00%R$ 10,0012,50%',
          'HGCR11Papel5,00%R$ 10,0012,50%',
          'KNIP11Papel6,00%R$ 10,0012,50%',
          'XPCI11Papel7,00%R$ 10,0012,50%',
          'XPML11Shopping8,00%R$ 10,0012,50%',
        ].join('\n'),
      );

      expect(rows.slice(0, 4)).toEqual([
        {
          ticker: 'RZTR11',
          segment: 'Agronegócio',
          ifixWeight: 0.0107,
          closePrice: 88.04,
          weight: 0.125,
        },
        {
          ticker: 'GARE11',
          segment: 'Outro',
          ifixWeight: 0.02,
          closePrice: 9.99,
          weight: 0.125,
        },
        {
          ticker: 'TRXF11',
          segment: 'Varejo',
          ifixWeight: 0.03,
          closePrice: 10,
          weight: 0.125,
        },
        {
          ticker: 'KNHF11',
          segment: 'Papel',
          ifixWeight: 0.04,
          closePrice: 10,
          weight: 0.125,
        },
      ]);
    });

    it('deve rejeitar tabela com quantidade de linhas insuficiente', () => {
      expect(() =>
        parseRendaTable('RZTR11Agronegócio1,07%R$ 88,04100,00%'),
      ).toThrow('entre 4 e 15');
    });

    it('deve rejeitar tickers duplicados', () => {
      const row = 'RZTR11Agronegócio1,07%R$ 88,0450,00%';
      expect(() => parseRendaTable(`${row}\n${row}\n${row}\n${row}`)).toThrow(
        'ticker duplicado',
      );
    });

    it('deve rejeitar soma de pesos fora da tolerância', () => {
      const rows = [
        'RZTR11Agronegócio1,07%R$ 88,0420,00%',
        'GARE11Outro2,00%R$ 9,9920,00%',
        'TRXF11Varejo3,00%R$ 10,0020,00%',
        'KNHF11Papel4,00%R$ 10,0020,00%',
      ];
      expect(() => parseRendaTable(rows.join('\n'))).toThrow('soma dos pesos');
    });
  });

  describe('parseBbFileName', () => {
    it('deve interpretar mês e revisão', () => {
      expect(parseBbFileName('CartFII_Set26_2.pdf')).toEqual({
        month: '2026-09',
        revision: 2,
      });
      expect(parseBbFileName('CartFII_Ago26.pdf')).toEqual({
        month: '2026-08',
        revision: 1,
      });
      expect(bbFileName('2026-09', 2)).toBe('CartFII_Set26_2.pdf');
      expect(bbFileName('2026-09', 1)).toBe('CartFII_Set26.pdf');
    });

    it('deve retornar nulo para nome inválido', () => {
      expect(parseBbFileName('outro.pdf')).toBeNull();
      expect(parseBbFileName('CartFII_Xxx26.pdf')).toBeNull();
      expect(parseBbFileName('CartFII_Set26_0.pdf')).toBeNull();
    });
  });

  describe('parseBbFiiPdf', () => {
    it('deve extrair a carteira de agosto', async () => {
      const buffer = readFileSync(
        join(__dirname, '../fixtures/CartFII_Ago26.pdf'),
      );
      const result = await parseBbFiiPdf(buffer);

      expect(result.publishedAt).toBe('2026-08-03');
      expect(result.renda).toHaveLength(8);
      expect(result.renda.map(({ ticker }) => ticker)).toEqual([
        'RZTR11',
        'GARE11',
        'TRXF11',
        'KNHF11',
        'HGCR11',
        'KNIP11',
        'XPCI11',
        'XPML11',
      ]);
      expect(result.renda[0]).toMatchObject({
        ticker: 'RZTR11',
        segment: 'Agronegócio',
        weight: 0.125,
        closePrice: 88.04,
        ifixWeight: 0.0107,
      });
      expect(result.ganho.map(({ ticker }) => ticker)).toEqual([
        'BTLG11',
        'HGLG11',
        'RZAT11',
        'VILG11',
        'PSEC11',
        'PCIP11',
        'RECR11',
        'CPSH11',
      ]);
      expect(result.ganho[0]).toMatchObject({
        ticker: 'BTLG11',
        segment: 'Logísticos',
        closePrice: 100.81,
        ifixWeight: 0.045,
      });
    });

    it('deve extrair a revisão de setembro', async () => {
      const buffer = readFileSync(
        join(__dirname, '../fixtures/CartFII_Set26_2.pdf'),
      );
      const result = await parseBbFiiPdf(buffer);

      expect(result.publishedAt).toBe('2026-09-02');
      expect(result.renda).toHaveLength(8);
      expect(result.renda.map(({ ticker }) => ticker)).toEqual([
        'RZTR11',
        'GARE11',
        'KNHF11',
        'HGCR11',
        'KNIP11',
        'MXRF11',
        'XPCI11',
        'XPML11',
      ]);
      expect(
        result.renda.find(({ ticker }) => ticker === 'MXRF11'),
      ).toMatchObject({
        closePrice: 9.18,
      });
      expect(result.ganho.map(({ ticker }) => ticker)).toEqual([
        'BTLG11',
        'HGLG11',
        'RZAT11',
        'VILG11',
        'PSEC11',
        'PCIP11',
        'RECR11',
        'CPSH11',
      ]);
      expect(
        result.ganho.find(({ ticker }) => ticker === 'CPSH11'),
      ).toMatchObject({
        closePrice: 9.62,
      });
    });
  });
});
