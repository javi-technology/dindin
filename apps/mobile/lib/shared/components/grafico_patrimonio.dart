import 'package:flutter/material.dart';

import '../../contracts/contracts.g.dart';
import '../../core/format/moeda.dart';
import '../../core/theme/dindin_tokens.dart';

/// Evolução do patrimônio (issue #445).
///
/// Desenhado com `CustomPainter`, sem biblioteca de gráficos: a paleta do app
/// é a mesma da web e tem teste comparando as duas, e um pacote traria estilo
/// próprio para contornar em cada tela. É uma linha — o custo de desenhá-la é
/// menor que o de domar uma dependência.
class GraficoPatrimonio extends StatelessWidget {
  const GraficoPatrimonio({super.key, required this.historico});

  final List<PatrimonySnapshot> historico;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    // Um ponto só é uma reta sem informação, e nenhum é uma caixa vazia que o
    // usuário lê como erro: nos dois casos vale dizer o que está faltando.
    if (historico.length < 2) {
      return Padding(
        key: const Key('grafico-patrimonio-vazio'),
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'A evolução aparece aqui depois de alguns dias de histórico.',
          textAlign: TextAlign.center,
          style: TextStyle(color: t.textSecondary, fontSize: 13),
        ),
      );
    }

    final valores = historico.map((p) => p.total).toList();
    final maior = valores.reduce((a, b) => a > b ? a : b);
    final menor = valores.reduce((a, b) => a < b ? a : b);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          Moeda.exibir(maior),
          style: TextStyle(color: t.textSecondary, fontSize: 12),
        ),
        SizedBox(
          height: 140,
          child: CustomPaint(
            painter: _LinhaDoPatrimonio(
              valores: valores,
              cor: t.action,
              corDaArea: t.action.withValues(alpha: 0.12),
            ),
            child: const SizedBox.expand(),
          ),
        ),
        Text(
          Moeda.exibir(menor),
          style: TextStyle(color: t.textSecondary, fontSize: 12),
        ),
      ],
    );
  }
}

class _LinhaDoPatrimonio extends CustomPainter {
  const _LinhaDoPatrimonio({
    required this.valores,
    required this.cor,
    required this.corDaArea,
  });

  final List<double> valores;
  final Color cor;
  final Color corDaArea;

  @override
  void paint(Canvas canvas, Size size) {
    final maior = valores.reduce((a, b) => a > b ? a : b);
    final menor = valores.reduce((a, b) => a < b ? a : b);
    // Série constante não tem amplitude: sem isto a divisão zeraria e a linha
    // sumiria do gráfico.
    final amplitude = maior - menor == 0 ? 1.0 : maior - menor;

    final passo = size.width / (valores.length - 1);
    final pontos = [
      for (var i = 0; i < valores.length; i++)
        Offset(
          passo * i,
          size.height - ((valores[i] - menor) / amplitude) * size.height,
        ),
    ];

    final linha = Path()..moveTo(pontos.first.dx, pontos.first.dy);
    for (final ponto in pontos.skip(1)) {
      linha.lineTo(ponto.dx, ponto.dy);
    }

    final area = Path.from(linha)
      ..lineTo(pontos.last.dx, size.height)
      ..lineTo(pontos.first.dx, size.height)
      ..close();

    canvas.drawPath(area, Paint()..color = corDaArea);
    canvas.drawPath(
      linha,
      Paint()
        ..color = cor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_LinhaDoPatrimonio anterior) =>
      anterior.valores != valores || anterior.cor != cor;
}
