const getFirestoreMock = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => getFirestoreMock(),
}));

import {
  loadAllQuotePrices,
  quotePricesFromDocs,
} from '../../src/quotes/quote-prices';

// ---------------------------------------------------------------------------
// Mapa de cotações por ticker (issue #302)
//
// O mesmo mapa era montado de quatro formas — em `patrimony-snapshot`,
// `target-price`, `recommended-wallet.service` e `monthly-income` —, cada uma
// com sua regra para preço ausente ou inválido. A divergência aparecia como
// diferença de total entre a tela de patrimônio e a de carteira.
// ---------------------------------------------------------------------------

function quoteDoc(id: string, data: unknown) {
  return { id, data: () => data };
}

describe('quotes/quote-prices', () => {
  describe('quotePricesFromDocs', () => {
    it('deve indexar por ticker em maiúsculas', () => {
      const prices = quotePricesFromDocs([
        quoteDoc('hglg11', { price: 112.5 }),
        quoteDoc('XPML11', { price: 98 }),
      ]);

      expect(prices.get('HGLG11')).toBe(112.5);
      expect(prices.get('XPML11')).toBe(98);
    });

    it('deve ignorar cotação sem preço utilizável', () => {
      const prices = quotePricesFromDocs([
        quoteDoc('AAAA11', { price: null }),
        quoteDoc('BBBB11', { price: '12,50' }),
        quoteDoc('CCCC11', { price: Number.NaN }),
        quoteDoc('DDDD11', {}),
      ]);

      expect(prices.size).toBe(0);
    });

    it('deve aceitar preço zero', () => {
      const prices = quotePricesFromDocs([quoteDoc('AAAA11', { price: 0 })]);

      expect(prices.get('AAAA11')).toBe(0);
    });

    // O job de preço-alvo descarta preço zero: com ele, qualquer alvo seria
    // considerado atingido e o usuário receberia e-mail de alerta indevido.
    it('deve descartar preço zero quando só positivos são aceitos', () => {
      const prices = quotePricesFromDocs(
        [quoteDoc('AAAA11', { price: 0 }), quoteDoc('BBBB11', { price: 12 })],
        { positiveOnly: true },
      );

      expect(prices.has('AAAA11')).toBe(false);
      expect(prices.get('BBBB11')).toBe(12);
    });
  });

  describe('loadAllQuotePrices', () => {
    it('deve ler a coleção inteira e devolver o mapa', async () => {
      const get = jest.fn().mockResolvedValue({
        docs: [quoteDoc('HGLG11', { price: 112.5 })],
      });
      getFirestoreMock.mockReturnValue({
        collection: jest.fn((name: string) => {
          expect(name).toBe('quotes');
          return { get };
        }),
      });

      const prices = await loadAllQuotePrices();

      expect(prices.get('HGLG11')).toBe(112.5);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('deve repassar a opção de só positivos', async () => {
      const get = jest.fn().mockResolvedValue({
        docs: [quoteDoc('AAAA11', { price: 0 })],
      });
      getFirestoreMock.mockReturnValue({
        collection: jest.fn(() => ({ get })),
      });

      const prices = await loadAllQuotePrices({ positiveOnly: true });

      expect(prices.size).toBe(0);
    });
  });
});
