import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/shared/components/grafico_composicao.dart';
import 'package:dindin_mobile/shared/components/grafico_patrimonio.dart';

// ---------------------------------------------------------------------------
// Gráficos do app (issue #445).
//
// A web mostra evolução e composição; o app só informava o saldo de agora, e
// o usuário abria o site para ver o resto.
//
// Os gráficos são desenhados com `CustomPainter`, sem biblioteca: a paleta do
// app é a mesma da web e tem teste comparando as duas, e uma biblioteca traria
// estilo próprio para contornar a cada tela. São dois gráficos simples, e o
// custo de desenhá-los é menor que o de domar um pacote.
// ---------------------------------------------------------------------------

PatrimonySnapshot ponto(String data, double total) => PatrimonySnapshot(
  id: data,
  userId: 'u1',
  date: data,
  totalWallet: total,
  totalFridge: 0,
  total: total,
  createdAt: '${data}T00:00:00Z',
);

void main() {
  Widget emApp(Widget filho, {Brightness brilho = Brightness.light}) =>
      MaterialApp(
        theme: brilho == Brightness.light
            ? DinDinTheme.claro
            : DinDinTheme.escuro,
        home: Scaffold(body: filho),
      );

  group('GraficoPatrimonio', () {
    final historico = [
      ponto('2026-07-01', 10000),
      ponto('2026-08-01', 12500),
      ponto('2026-09-01', 11800),
    ];

    testWidgets('desenha a série recebida', (tester) async {
      await tester.pumpWidget(emApp(GraficoPatrimonio(historico: historico)));

      expect(find.byType(CustomPaint), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    // Um gráfico com um ponto só é uma reta sem informação, e com nenhum é
    // uma caixa vazia que o usuário lê como erro.
    testWidgets('avisa quando ainda não há histórico', (tester) async {
      await tester.pumpWidget(emApp(const GraficoPatrimonio(historico: [])));

      expect(find.byKey(const Key('grafico-patrimonio-vazio')), findsOneWidget);
    });

    testWidgets('mostra o maior e o menor valor da série', (tester) async {
      await tester.pumpWidget(emApp(GraficoPatrimonio(historico: historico)));

      expect(find.textContaining('12.500'), findsOneWidget);
      expect(find.textContaining('10.000'), findsOneWidget);
    });

    testWidgets('funciona no tema escuro', (tester) async {
      await tester.pumpWidget(
        emApp(
          GraficoPatrimonio(historico: historico),
          brilho: Brightness.dark,
        ),
      );

      expect(tester.takeException(), isNull);
    });
  });

  group('GraficoComposicao', () {
    final composicao = [
      const TickerValue(ticker: 'HGLG11', value: 6000),
      const TickerValue(ticker: 'MXRF11', value: 3000),
      const TickerValue(ticker: 'XPML11', value: 1000),
    ];

    testWidgets('lista os ativos com o percentual de cada um', (tester) async {
      await tester.pumpWidget(
        emApp(GraficoComposicao(composicao: composicao)),
      );

      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.textContaining('60,0%'), findsOneWidget);
      expect(find.textContaining('30,0%'), findsOneWidget);
    });

    // Numa tela de celular, uma legenda com trinta ativos empurra o resto da
    // tela para fora; o que sobra vira uma fatia só.
    testWidgets('agrupa a cauda em "Outros"', (tester) async {
      final muitos = [
        for (var i = 0; i < 10; i++)
          TickerValue(ticker: 'AAA$i', value: 1000 - i * 10.0),
      ];

      await tester.pumpWidget(emApp(GraficoComposicao(composicao: muitos)));

      expect(find.text('Outros'), findsOneWidget);
    });

    testWidgets('avisa quando não há composição', (tester) async {
      await tester.pumpWidget(
        emApp(const GraficoComposicao(composicao: [])),
      );

      expect(find.byKey(const Key('grafico-composicao-vazio')), findsOneWidget);
    });
  });
}
