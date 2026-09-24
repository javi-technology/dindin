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

/** Converte valores monetários nos formatos pt-BR e decimal internacional. */
export function parseBrlNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formata um número como moeda em reais (pt-BR). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Formata uma data `YYYY-MM-DD` como `dd/MM/yyyy`, sem conversão de fuso. */
export function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Rótulo da data de apuração da cotação (issue #390), como
 * "Fechamento de 23/09/2026", ou `null` quando não há horário de apuração.
 *
 * O dia é o de São Paulo, não o do UTC: o fechamento de um pregão carimbado
 * em 02:00Z pertence ao dia anterior aqui, e exibir o dia seguinte faria o
 * preço parecer mais novo do que é. Cotações gravadas antes da #387 não têm
 * o horário, e a tela então não mostra indicação nenhuma.
 */
export function formatQuotedAt(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
  return `Fechamento de ${date}`;
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

/**
 * Mês `YYYY-MM` como "set/2026". Fica aqui desde a divisão da tela de
 * proventos (#311), quando os indicadores e o relatório mensal, que passaram
 * a ser componentes distintos, precisaram do mesmo rótulo.
 */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(year, monthNumber - 1, 1))
    .replace(/\./g, '')
    .replace(' de ', '/');
}
