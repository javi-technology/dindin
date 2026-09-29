import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';

/// Composição da carteira por ativo (issue #445).
///
/// Barras, e não pizza: em tela de celular a pizza vira um disco pequeno com
/// legenda à parte, e a comparação entre fatias — que é o ponto — fica pior do
/// que numa lista ordenada.
class GraficoComposicao extends StatelessWidget {
  const GraficoComposicao({
    super.key,
    required this.composicao,
    this.maximoDeLinhas = 5,
  });

  final List<TickerValue> composicao;

  /// Ativos mostrados antes de agrupar o resto em "Outros". Uma legenda com
  /// trinta linhas empurra o resto da tela para fora.
  final int maximoDeLinhas;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    if (composicao.isEmpty) {
      return Padding(
        key: const Key('grafico-composicao-vazio'),
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'Cadastre uma posição para ver a composição da carteira.',
          textAlign: TextAlign.center,
          style: TextStyle(color: t.textSecondary, fontSize: 13),
        ),
      );
    }

    final total = composicao.fold<double>(0, (soma, item) => soma + item.value);
    final linhas = _agrupar();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final linha in linhas)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: _Linha(
              rotulo: linha.ticker,
              valor: linha.value,
              fracao: total == 0 ? 0 : linha.value / total,
            ),
          ),
      ],
    );
  }

  /// Os primeiros ficam; a cauda vira uma linha só.
  ///
  /// A ordem é a que a API devolveu — decrescente por valor e com a geladeira
  /// contada uma vez. Reordenar aqui reaplicaria regra de negócio no cliente,
  /// que foi o que a #300 tirou da web.
  List<TickerValue> _agrupar() {
    if (composicao.length <= maximoDeLinhas) return composicao;

    final cabeca = composicao.take(maximoDeLinhas).toList();
    final cauda = composicao.skip(maximoDeLinhas);

    return [
      ...cabeca,
      TickerValue(
        ticker: 'Outros',
        value: cauda.fold<double>(0, (soma, item) => soma + item.value),
      ),
    ];
  }
}

class _Linha extends StatelessWidget {
  const _Linha({
    required this.rotulo,
    required this.valor,
    required this.fracao,
  });

  final String rotulo;
  final double valor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(rotulo, style: const TextStyle(fontSize: 13))),
            Text(
              Moeda.percentual(fracao),
              style: TextStyle(color: t.textSecondary, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: fracao,
            minHeight: 8,
            backgroundColor: t.surfaceSunken,
            valueColor: AlwaysStoppedAnimation(t.action),
          ),
        ),
      ],
    );
  }
}
