import {
  resolveQuantity,
  weightedAveragePrice,
} from './position-quantity.util';

describe('position-quantity.util', () => {
  describe('resolveQuantity', () => {
    it('usa o valor informado como total', () => {
      expect(resolveQuantity('59', 32)).toEqual({
        mode: 'total',
        quantity: 59,
      });
    });

    it('aceita número como total', () => {
      expect(resolveQuantity(59, 32)).toEqual({ mode: 'total', quantity: 59 });
    });

    it('soma a variação com prefixo +', () => {
      expect(resolveQuantity('+27', 32)).toEqual({ mode: 'add', quantity: 59 });
    });

    it('aceita vírgula decimal na variação', () => {
      expect(resolveQuantity('+0,5', 32)).toEqual({
        mode: 'add',
        quantity: 32.5,
      });
    });

    it('ignora espaços ao redor do valor', () => {
      expect(resolveQuantity(' +27 ', 32)).toEqual({
        mode: 'add',
        quantity: 59,
      });
    });

    it('subtrai a variação com prefixo -', () => {
      expect(resolveQuantity('-10', 32)).toEqual({
        mode: 'subtract',
        quantity: 22,
      });
    });

    it('equivale ao valor informado ao somar sem quantidade prévia', () => {
      expect(resolveQuantity('+15', 0)).toEqual({ mode: 'add', quantity: 15 });
    });

    it('rejeita subtração que zera a posição', () => {
      expect(resolveQuantity('-32', 32)).toBeNull();
    });

    it('rejeita subtração que deixa a posição negativa', () => {
      expect(resolveQuantity('-40', 32)).toBeNull();
    });

    it('rejeita subtração sem quantidade prévia', () => {
      expect(resolveQuantity('-5', 0)).toBeNull();
    });

    it('rejeita sinal sem número', () => {
      expect(resolveQuantity('+', 32)).toBeNull();
      expect(resolveQuantity('-', 32)).toBeNull();
    });

    it('rejeita texto não numérico', () => {
      expect(resolveQuantity('+abc', 32)).toBeNull();
      expect(resolveQuantity('abc', 32)).toBeNull();
    });

    it('rejeita variação zero ou com sinal duplicado', () => {
      expect(resolveQuantity('+0', 32)).toBeNull();
      expect(resolveQuantity('+-5', 32)).toBeNull();
    });

    it('rejeita total vazio, zero ou negativo', () => {
      expect(resolveQuantity('', 32)).toBeNull();
      expect(resolveQuantity(null, 32)).toBeNull();
      expect(resolveQuantity('0', 32)).toBeNull();
    });
  });

  describe('weightedAveragePrice', () => {
    it('calcula a média ponderada arredondada a 2 casas', () => {
      expect(weightedAveragePrice(32, 9.18, 27, 9.45)).toBe(9.3);
    });

    it('retorna o preço da compra quando não há quantidade prévia', () => {
      expect(weightedAveragePrice(0, 0, 15, 9.8)).toBe(9.8);
    });
  });
});
