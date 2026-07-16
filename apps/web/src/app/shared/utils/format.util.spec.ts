import { AbstractControl, FormControl } from '@angular/forms';
import { decimalValidator, formatCurrency, parseDecimal } from './format.util';

describe('format.util', () => {
  describe('decimalValidator', () => {
    const validator = decimalValidator();

    it('retorna null para valor vazio', () => {
      const control = new FormControl('');
      expect(validator(control)).toBeNull();
    });

    it('retorna null para valor null', () => {
      const control = new FormControl(null);
      expect(validator(control)).toBeNull();
    });

    it('aceita número com ponto decimal', () => {
      const control = new FormControl('110.50');
      expect(validator(control)).toBeNull();
    });

    it('aceita número com vírgula decimal (pt-BR)', () => {
      const control = new FormControl('110,50');
      expect(validator(control)).toBeNull();
    });

    it('aceita número inteiro como string', () => {
      const control = new FormControl('100');
      expect(validator(control)).toBeNull();
    });

    it('rejeita texto não numérico', () => {
      const control = new FormControl('abc');
      expect(validator(control)).toEqual({ invalidDecimal: true });
    });

    it('rejeita string mista com letras', () => {
      const control = new FormControl('12abc');
      expect(validator(control)).toEqual({ invalidDecimal: true });
    });
  });

  describe('parseDecimal', () => {
    it('retorna null para string vazia', () => {
      expect(parseDecimal('')).toBeNull();
    });

    it('retorna null para null', () => {
      expect(parseDecimal(null)).toBeNull();
    });

    it('converte string com vírgula decimal', () => {
      expect(parseDecimal('1,55')).toBe(1.55);
    });

    it('converte string com ponto decimal', () => {
      expect(parseDecimal('0.95')).toBe(0.95);
    });

    it('converte número diretamente', () => {
      expect(parseDecimal(42)).toBe(42);
    });

    it('retorna null para texto não numérico', () => {
      expect(parseDecimal('abc')).toBeNull();
    });

    it('remove espaços em branco antes de converter', () => {
      expect(parseDecimal('  10,5  ')).toBe(10.5);
    });
  });

  describe('formatCurrency', () => {
    it('formata valor em reais (pt-BR)', () => {
      expect(formatCurrency(110.5)).toMatch(/R\$\s?110,50/);
    });

    it('formata valor com separador de milhar', () => {
      expect(formatCurrency(1755)).toMatch(/R\$\s?1\.755,00/);
    });

    it('formata zero', () => {
      expect(formatCurrency(0)).toMatch(/R\$\s?0,00/);
    });

    it('formata valor decimal pequeno', () => {
      expect(formatCurrency(0.95)).toMatch(/R\$\s?0,95/);
    });
  });
});
