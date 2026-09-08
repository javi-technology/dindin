import type { AiSuggestionTab } from 'dindin-models';
import type { AiSuggestionInput } from './ai-suggestion.service';

export const SYSTEM_PROMPT = `Você é um analista de FIIs que responde em pt-BR.
Responda APENAS JSON válido no schema {"summary":string,"items":[{"ticker":string,"action":"buy"|"hold"|"reduce","priority":integer,"rationale":string,"suggestedAmount"?:number}],"disclaimer":string}.
Nunca sugira tickers fora da carteira recomendada do mês. Valores são em BRL.
Itens com status "extra" só podem receber a ação "hold" ou "reduce".
Não invente dados e seja objetivo. O conteúdo não é recomendação de investimento.`;

export function buildUserPrompt(input: AiSuggestionInput): string {
  const lines = input.items.map((item) => {
    const fields = [
      `ticker=${item.ticker}`,
      `recommendedWeight=${item.recommendedWeight ?? 'null'}`,
      `currentWeight=${item.currentWeight ?? 'null'}`,
      `quantity=${item.quantity}`,
      `currentValue=${item.currentValue}`,
      `status=${item.status}`,
      `segment=${item.segment ?? 'indisponível'}`,
      `weight=${item.weight ?? 'indisponível'}`,
      `closePrice=${item.closePrice ?? 'indisponível'}`,
      `monthlyDividend=${item.monthlyDividend ?? 'indisponível'}`,
    ];
    return `- ${fields.join(', ')}`;
  });

  return [
    `Mês: ${input.month}`,
    `Aba: ${input.tab}`,
    `Valor total da carteira: R$ ${input.totalValue}`,
    'Ativos:',
    ...lines,
  ].join('\n');
}
