import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Valida que o valor é um número decimal válido (aceita vírgula ou ponto).
 * Retorna `null` quando o controle está vazio (validação de presença fica
 * a cargo de `Validators.required` quando aplicável).
 */
export function decimalValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value == null || value === '') return null;
    const normalized = String(value).trim().replace(/,/g, '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? { invalidDecimal: true } : null;
  };
}

/**
 * Converte uma string (ou número) em número decimal, aceitando vírgula
 * como separador decimal (locale pt-BR). Retorna `null` quando o valor
 * é vazio ou não numérico.
 */
export function parseDecimal(value: string | number | null): number | null {
  if (value == null || value === '') {
    return null;
  }
  const normalized = String(value).trim().replace(/,/g, '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Formata um número como moeda em reais (pt-BR). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Formata um número como moeda compacta em reais (pt-BR). */
export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formata um número como percentual (pt-BR).
 * O valor deve ser informado em pontos percentuais (ex: 9.64 para 9,64%).
 */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
