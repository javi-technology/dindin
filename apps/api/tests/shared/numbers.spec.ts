import {
  roundCurrency,
  validPositivePrice,
  validPrice,
  validQuantity,
} from '../../src/shared/numbers';

// ---------------------------------------------------------------------------
// Helpers numéricos compartilhados (issue #302)
//
// `roundCurrency` existia em três arquivos, `validQuantity` em três e
// `validPrice` em dois, cada um com pequenas variações. Valores vindos do
// Firestore são `unknown`: documento antigo, importação manual ou bug de
// gravação podem trazer string, null ou NaN, e um NaN se espalha por toda a
// soma de patrimônio sem erro nenhum.
// ---------------------------------------------------------------------------

describe('shared/numbers', () => {
  describe('roundCurrency', () => {
    it('deve arredondar a duas casas', () => {
      expect(roundCurrency(2.345)).toBe(2.35);
      expect(roundCurrency(2.344)).toBe(2.34);
      expect(roundCurrency(10)).toBe(10);
    });

    // Comportamento herdado das três cópias que este módulo substitui: 1.005
    // é 1.00499… em binário, então arredonda para baixo. Fica registrado
    // para que a diferença de um centavo não vire caça ao fantasma depois.
    it('arredonda para baixo quando o valor binário fica abaixo da metade', () => {
      expect(roundCurrency(1.005)).toBe(1);
    });

    it('deve eliminar resíduo de ponto flutuante', () => {
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
      expect(roundCurrency(1.25 + 0.5)).toBe(1.75);
    });

    it('deve preservar o sinal', () => {
      expect(roundCurrency(-2.346)).toBe(-2.35);
    });
  });

  describe('validQuantity', () => {
    it('deve aceitar número não negativo', () => {
      expect(validQuantity(10)).toBe(10);
      expect(validQuantity(0)).toBe(0);
      expect(validQuantity(2.5)).toBe(2.5);
    });

    it('deve devolver zero para valor inválido', () => {
      expect(validQuantity(-1)).toBe(0);
      expect(validQuantity(Number.NaN)).toBe(0);
      expect(validQuantity(Number.POSITIVE_INFINITY)).toBe(0);
      expect(validQuantity('10')).toBe(0);
      expect(validQuantity(null)).toBe(0);
      expect(validQuantity(undefined)).toBe(0);
    });
  });

  describe('validPrice', () => {
    it('deve aceitar número finito', () => {
      expect(validPrice(112.5)).toBe(112.5);
      expect(validPrice(0)).toBe(0);
    });

    // Preço negativo não existe em cotação, mas quem decide o que fazer com a
    // ausência é o chamador: `undefined` deixa o fallback (preço médio ou de
    // transferência) entrar.
    it('deve devolver undefined para valor não numérico', () => {
      expect(validPrice(Number.NaN)).toBeUndefined();
      expect(validPrice('112.5')).toBeUndefined();
      expect(validPrice(null)).toBeUndefined();
      expect(validPrice(undefined)).toBeUndefined();
    });
  });

  // O job de preço-alvo usa esta variante: preço ou alvo zero faria qualquer
  // comparação parecer atingida e dispararia e-mail de alerta indevido.
  describe('validPositivePrice', () => {
    it('deve aceitar apenas número positivo', () => {
      expect(validPositivePrice(112.5)).toBe(112.5);
      expect(validPositivePrice(0)).toBeUndefined();
      expect(validPositivePrice(-3)).toBeUndefined();
      expect(validPositivePrice(Number.NaN)).toBeUndefined();
      expect(validPositivePrice('112.5')).toBeUndefined();
      expect(validPositivePrice(null)).toBeUndefined();
    });
  });
});
