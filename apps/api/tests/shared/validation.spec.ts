import { z } from 'zod';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  currencyField,
  descriptionField,
  nameField,
  parseBody,
  positiveNumberField,
  tickerField,
} from '../../src/shared/validation';

// ---------------------------------------------------------------------------
// Validação de entrada por schema (issue #298)
//
// Cada controller tinha seu `validateXBody` escrito à mão, com regras que
// divergiam entre rotas: `if (!name)` aceitava objeto, número ou string de
// vários MB. O schema centraliza tipo e tamanho, e o `parseBody` devolve a
// primeira mensagem no mesmo formato que a API já usava.
// ---------------------------------------------------------------------------

describe('shared/validation', () => {
  describe('parseBody', () => {
    const schema = z.object({ name: nameField('Nome') });

    it('deve devolver os dados quando o corpo é válido', () => {
      const result = parseBody(schema, { name: 'Carteira Principal' });

      expect(result).toEqual({
        success: true,
        data: { name: 'Carteira Principal' },
      });
    });

    it('deve devolver a mensagem do primeiro campo inválido', () => {
      const result = parseBody(schema, { name: 42 });

      expect(result).toEqual({
        success: false,
        error: 'Nome é obrigatório e deve ser um texto',
      });
    });

    it('deve recusar corpo que não é objeto', () => {
      expect(parseBody(schema, 'texto')).toEqual({
        success: false,
        error: expect.any(String),
      });
      expect(parseBody(schema, null)).toEqual({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('nameField', () => {
    const schema = z.object({ name: nameField('Nome') });

    it.each([
      ['objeto', {}],
      ['número', 7],
      ['nulo', null],
      ['vazio', ''],
      ['só espaços', '   '],
    ])('deve recusar nome %s', (_caso, value) => {
      expect(parseBody(schema, { name: value }).success).toBe(false);
    });

    // Sem limite, um `name` de vários MB entrava no Firestore e quebrava a
    // tela de quem abrisse a carteira depois.
    it('deve recusar nome acima do limite', () => {
      const result = parseBody(schema, {
        name: 'a'.repeat(MAX_NAME_LENGTH + 1),
      });

      expect(result).toEqual({
        success: false,
        error: `Nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`,
      });
    });

    it('deve remover espaços das pontas', () => {
      const result = parseBody(schema, { name: '  Carteira  ' });

      expect(result).toEqual({ success: true, data: { name: 'Carteira' } });
    });
  });

  describe('descriptionField', () => {
    const schema = z.object({ description: descriptionField() });

    it('deve aceitar ausência e texto vazio', () => {
      expect(parseBody(schema, {}).success).toBe(true);
      expect(parseBody(schema, { description: '' }).success).toBe(true);
    });

    it('deve recusar descrição acima do limite', () => {
      expect(
        parseBody(schema, {
          description: 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1),
        }).success,
      ).toBe(false);
    });
  });

  describe('tickerField', () => {
    const schema = z.object({ ticker: tickerField() });

    it('deve normalizar para caixa alta sem espaços', () => {
      expect(parseBody(schema, { ticker: ' hglg11 ' })).toEqual({
        success: true,
        data: { ticker: 'HGLG11' },
      });
    });

    it('deve recusar ticker vazio ou não textual', () => {
      expect(parseBody(schema, { ticker: '' }).success).toBe(false);
      expect(parseBody(schema, { ticker: 123 }).success).toBe(false);
    });
  });

  describe('positiveNumberField', () => {
    const schema = z.object({ quantity: positiveNumberField('Quantidade') });

    it('deve aceitar número positivo', () => {
      expect(parseBody(schema, { quantity: 10 }).success).toBe(true);
    });

    it.each([
      ['zero', 0],
      ['negativo', -1],
      ['texto', '10'],
      ['NaN', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
    ])('deve recusar quantidade %s', (_caso, value) => {
      expect(parseBody(schema, { quantity: value }).success).toBe(false);
    });
  });

  describe('currencyField', () => {
    const schema = z.object({ currency: currencyField() });

    it('deve aceitar apenas BRL', () => {
      expect(parseBody(schema, { currency: 'BRL' }).success).toBe(true);
      expect(parseBody(schema, { currency: 'USD' }).success).toBe(false);
    });
  });
});
