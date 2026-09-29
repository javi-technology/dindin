import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';
import '../../shared/components/cartao.dart';
import '../../shared/components/selo_assinante.dart';

/// Sugestões da IA para a carteira recomendada (issue #446).
///
/// A #404 trouxe a comparação e parou aí: o usuário via o quanto está fora do
/// peso recomendado e não recebia o que fazer a respeito. É aqui que a
/// comparação vira decisão de compra.
class SugestoesView extends StatelessWidget {
  const SugestoesView({
    super.key,
    required this.sugestao,
    required this.temAcesso,
    required this.carregando,
    required this.aoGerar,
    this.erro,
  });

  final AiSuggestion? sugestao;

  /// Entitlement `ai`. Sem ele a API responde 402, então a tela não tenta.
  final bool temAcesso;

  final bool carregando;
  final VoidCallback aoGerar;

  /// Falha ao gerar. Vira aviso e **não** apaga a sugestão em tela: gerar de
  /// novo custa uma chamada à IA.
  final String? erro;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final atual = sugestao;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Sugestões da IA',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            // Escondê-lo faria o assinante não descobrir que o recurso
            // existe — a mesma razão do selo na simulação por ativo.
            if (!temAcesso) const SeloAssinante(key: Key('selo-sugestoes')),
          ],
        ),
        const SizedBox(height: 8),
        if (!temAcesso)
          Text(
            'Receber o que fazer com a sua carteira é um recurso de assinante.',
            style: TextStyle(color: t.textSecondary, fontSize: 13),
          )
        else ...[
          FilledButton(
            key: const Key('gerar-sugestao'),
            // Sem o `null` enquanto carrega, o toque repetido dispararia
            // várias consultas ao provedor de IA.
            onPressed: carregando ? null : aoGerar,
            child: Text(
              carregando
                  ? 'Gerando…'
                  : atual == null
                  ? 'Gerar sugestão'
                  : 'Gerar de novo',
            ),
          ),
          if (erro != null) ...[
            const SizedBox(height: 8),
            Text(erro!, style: TextStyle(color: t.danger, fontSize: 13)),
          ],
          if (atual != null) ...[
            const SizedBox(height: 12),
            Cartao(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(atual.summary),
                  const SizedBox(height: 12),
                  for (final item in atual.items) _Item(item: item),
                  const SizedBox(height: 12),
                  Text(
                    atual.disclaimer,
                    style: TextStyle(color: t.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.item});

  final AiSuggestionItem item;

  /// A API transmite a ação em inglês; a tela é em pt-BR.
  static const _acoes = {'buy': 'Comprar', 'sell': 'Vender', 'hold': 'Manter'};

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final valor = item.suggestedAmount;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.ticker,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                _acoes[item.action] ?? item.action,
                style: TextStyle(color: t.textSecondary, fontSize: 13),
              ),
              if (valor != null) ...[
                const SizedBox(width: 8),
                Text(Moeda.exibir(valor), style: const TextStyle(fontSize: 13)),
              ],
            ],
          ),
          Text(
            item.rationale,
            style: TextStyle(color: t.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
