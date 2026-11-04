import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/core/theme/dindin_tokens.dart';
import 'package:dindin_mobile/features/geladeira/geladeira_view.dart';

// ---------------------------------------------------------------------------
// Geladeira (issue #402).
//
// O item fica parado aguardando a valorização para a venda (issue #587), então
// o que a tela precisa responder num relance é: já chegou no alvo? Sem cotação,
// ela não responde — e dizer isso é melhor do que mostrar um número que não
// existe.
// ---------------------------------------------------------------------------
FridgeItem item({
  String ticker = 'MXRF11',
  double targetPrice = 9.5,
  double? currentPrice,
}) => FridgeItem(
  id: 'i1',
  fridgeId: 'f1',
  ticker: ticker,
  quantity: 100,
  transferredPrice: 10,
  targetPrice: targetPrice,
  currentPrice: currentPrice,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
);

void main() {
  Widget arvore(EstadoDoRecurso<List<FridgeItem>> estado) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(
      body: GeladeiraView(estado: estado, aoRecarregar: () {}),
    ),
  );

  testWidgets('mostra ticker e preço-alvo em pt-BR', (tester) async {
    await tester.pumpWidget(
      arvore(EstadoDoRecurso(dados: [item(currentPrice: 10.2)])),
    );

    expect(find.text('MXRF11'), findsOneWidget);
    expect(find.textContaining('9,50'), findsOneWidget);
  });

  testWidgets('preço-alvo atingido é sinalizado', (tester) async {
    await tester.pumpWidget(
      arvore(EstadoDoRecurso(dados: [item(currentPrice: 10.2)])),
    );

    final marca = tester.widget<Text>(find.byKey(const Key('alvo-MXRF11')));
    expect(
      marca.style!.color,
      DinDinTheme.claro.extension<DinDinTokens>()!.positiveInk,
    );
  });

  testWidgets('cotação igual ao alvo é sinalizada como atingida', (
    tester,
  ) async {
    await tester.pumpWidget(
      arvore(EstadoDoRecurso(dados: [item(currentPrice: 9.5)])),
    );

    expect(find.byKey(const Key('alvo-MXRF11')), findsOneWidget);
  });

  testWidgets('abaixo do alvo não é sinalizado como atingido', (tester) async {
    await tester.pumpWidget(
      arvore(EstadoDoRecurso(dados: [item(currentPrice: 9.4)])),
    );

    expect(find.byKey(const Key('alvo-MXRF11')), findsNothing);
  });

  testWidgets('sem cotação, sinaliza em vez de comparar com zero', (
    tester,
  ) async {
    await tester.pumpWidget(arvore(EstadoDoRecurso(dados: [item()])));

    expect(find.byKey(const Key('sem-cotacao-MXRF11')), findsOneWidget);
    expect(find.byKey(const Key('alvo-MXRF11')), findsNothing);
  });

  testWidgets('geladeira vazia explica', (tester) async {
    await tester.pumpWidget(
      arvore(const EstadoDoRecurso(dados: <FridgeItem>[])),
    );

    expect(find.textContaining('Nenhum ativo'), findsOneWidget);
  });

  testWidgets('geladeira vazia não fala em compra', (tester) async {
    await tester.pumpWidget(
      arvore(const EstadoDoRecurso(dados: <FridgeItem>[])),
    );

    expect(find.textContaining('compra'), findsNothing);
  });

  group('quadro explicativo (issue #587)', () {
    const objetivo = Key('explicacao-geladeira');

    testWidgets('explica o objetivo da geladeira', (tester) async {
      await tester.pumpWidget(
        arvore(EstadoDoRecurso(dados: [item(currentPrice: 10.2)])),
      );

      expect(find.byKey(objetivo), findsOneWidget);
      expect(
        find.textContaining('sem recomendação de aporte'),
        findsOneWidget,
      );
      expect(find.textContaining('valorização'), findsOneWidget);
      expect(find.textContaining('venda'), findsOneWidget);
      expect(find.textContaining('dividendos'), findsOneWidget);
    });

    testWidgets('aparece com a geladeira vazia', (tester) async {
      await tester.pumpWidget(
        arvore(const EstadoDoRecurso(dados: <FridgeItem>[])),
      );

      expect(find.byKey(objetivo), findsOneWidget);
      expect(find.textContaining('Nenhum ativo'), findsOneWidget);
    });
  });
}
