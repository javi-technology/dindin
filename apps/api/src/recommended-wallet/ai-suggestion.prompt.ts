import type { AiSuggestionTab } from 'dindin-models';
import type { AiSuggestionInput } from './ai-suggestion.service';

export const SYSTEM_PROMPT = `Você é um analista de FIIs que responde em pt-BR.
Responda APENAS JSON válido no schema {"summary":string,"items":[{"ticker":string,"action":"buy"|"hold"|"reduce","priority":integer,"rationale":string,"suggestedAmount"?:number}],"disclaimer":string}.
Nunca sugira tickers fora da carteira recomendada do mês. Valores são em BRL.
Itens com status "extra" só podem receber a ação "hold" ou "reduce".
Os valores de "suggestedAmount" para itens com ação "buy" devem somar no máximo o total disponível e devem distribuí-lo priorizando tickers "missing" e abaixo do peso recomendado.
Quando nenhum aporte for informado, "suggestedAmount" é opcional.
Use o histórico das carteiras recomendadas dos meses anteriores para contextualizar (ex.: ticker recém-incluído, peso crescente ou decrescente, ticker removido).
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

  const historyLines =
    input.history.length > 0
      ? [
          'Histórico da carteira recomendada (meses anteriores):',
          ...input.history.map(
            (item) =>
              `- ${item.month}: ${item.assets
                .map(
                  (asset) =>
                    `${asset.ticker} peso=${asset.weight} segmento=${asset.segment}`,
                )
                .join('; ')}`,
          ),
        ]
      : ['Histórico da carteira recomendada: indisponível'];

  return [
    `Mês: ${input.month}`,
    `Aba: ${input.tab}`,
    `Valor total da carteira: R$ ${input.totalValue}`,
    `Aporte disponível neste mês: R$ ${input.contribution ?? 'não informado'}`,
    `Proventos mensais projetados da carteira: R$ ${input.projectedDividends}`,
    ...(input.contribution === undefined
      ? []
      : [
          `Total disponível para investir: R$ ${
            input.contribution + input.projectedDividends
          }`,
        ]),
    'Ativos:',
    ...lines,
    ...historyLines,
  ].join('\n');
}
