import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/core/theme/dindin_tokens.dart';
import 'package:dindin_mobile/features/carteiras/carteiras_view.dart';
import 'package:dindin_mobile/features/carteiras/posicoes_view.dart';

// ---------------------------------------------------------------------------
// Carteiras e posições (issue #402).
//
// Ativo sem cotação conhecida aparece **sinalizado**, nunca como zero: num
// app financeiro, zero é um número, e o usuário o lê como um.
// ---------------------------------------------------------------------------
Position posicao({
  String ticker = 'HGLG11',
  double quantity = 10,
  double averagePrice = 100,
  double? currentPrice,
}) => Position(
  id: 'p1',
  walletId: 'w1',
  ticker: ticker,
  assetType: AssetType.fii,
  quantity: quantity,
  averagePrice: averagePrice,
  currentPrice: currentPrice,
  inFridge: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
);

void main() {
  Widget comPosicoes(EstadoDoRecurso<List<Position>> estado) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(
      body: PosicoesView(estado: estado, aoRecarregar: () {}),
    ),
  );

  group('posições', () {
    testWidgets('mostra ticker, quantidade e valor em pt-BR', (tester) async {
      await tester.pumpWidget(
        comPosicoes(
          EstadoDoRecurso(dados: [posicao(currentPrice: 110.5)]),
        ),
      );

      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.textContaining('1.105,00'), findsOneWidget);
    });

    testWidgets('sem cotação, sinaliza em vez de mostrar zero', (tester) async {
      await tester.pumpWidget(comPosicoes(EstadoDoRecurso(dados: [posicao()])));

      expect(find.byKey(const Key('sem-cotacao-HGLG11')), findsOneWidget);
      expect(find.textContaining('R 0,00'), findsNothing);
    });

    // Alta e baixa usam `positive` e `danger`, nunca o token da marca.
    testWidgets('valorização aparece com o token positivo', (tester) async {
      await tester.pumpWidget(
        comPosicoes(
          EstadoDoRecurso(dados: [posicao(currentPrice: 110)]),
        ),
      );

      final texto = tester.widget<Text>(
        find.byKey(const Key('variacao-HGLG11')),
      );
      expect(
        texto.style!.color,
        DinDinTheme.claro.extension<DinDinTokens>()!.positive,
      );
    });

    testWidgets('desvalorização aparece com o token de perigo', (tester) async {
      await tester.pumpWidget(
        comPosicoes(
          EstadoDoRecurso(dados: [posicao(currentPrice: 90)]),
        ),
      );

      final texto = tester.widget<Text>(
        find.byKey(const Key('variacao-HGLG11')),
      );
      expect(
        texto.style!.color,
        DinDinTheme.claro.extension<DinDinTokens>()!.danger,
      );
    });

    testWidgets('carteira sem posição explica', (tester) async {
      await tester.pumpWidget(
        comPosicoes(const EstadoDoRecurso(dados: <Position>[])),
      );

      expect(find.textContaining('Nenhuma posição'), findsOneWidget);
    });

    testWidgets('erro oferece nova tentativa', (tester) async {
      await tester.pumpWidget(
        comPosicoes(const EstadoDoRecurso(erro: 'Sem conexão.')),
      );

      expect(find.text('Tentar de novo'), findsOneWidget);
    });
  });

  group('carteiras', () {
    Widget comCarteiras(EstadoDoRecurso<List<Wallet>> estado) => MaterialApp(
      theme: DinDinTheme.claro,
      home: Scaffold(
        body: CarteirasView(
          estado: estado,
          aoRecarregar: () {},
          aoAbrir: (_) {},
        ),
      ),
    );

    Wallet carteira({String nome = 'Principal'}) => Wallet(
      id: 'w1',
      ownerId: 'u1',
      name: nome,
      currency: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    );

    testWidgets('lista as carteiras', (tester) async {
      await tester.pumpWidget(
        comCarteiras(EstadoDoRecurso(dados: [carteira()])),
      );

      expect(find.text('Principal'), findsOneWidget);
    });

    testWidgets('tocar numa carteira a abre', (tester) async {
      Wallet? aberta;
      await tester.pumpWidget(
        MaterialApp(
          theme: DinDinTheme.claro,
          home: Scaffold(
            body: CarteirasView(
              estado: EstadoDoRecurso(dados: [carteira()]),
              aoRecarregar: () {},
              aoAbrir: (c) => aberta = c,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Principal'));
      expect(aberta?.id, 'w1');
    });

    testWidgets('sem carteira, explica', (tester) async {
      await tester.pumpWidget(
        comCarteiras(const EstadoDoRecurso(dados: <Wallet>[])),
      );

      expect(find.textContaining('Nenhuma carteira'), findsOneWidget);
    });
  });
}
