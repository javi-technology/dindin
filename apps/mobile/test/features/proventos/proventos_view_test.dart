import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/proventos/projecao_view.dart';
import 'package:dindin_mobile/features/proventos/proventos_view.dart';

// ---------------------------------------------------------------------------
// Proventos recebidos e projetados (issue #402).
//
// A projeção parte do último provento real, e ativo sem provento conhecido é
// declarado como tal: exibi-lo com renda zero faria o usuário achar que o
// ativo não paga nada, quando o app é que não sabe.
// ---------------------------------------------------------------------------
void main() {
  group('recebidos', () {
    Widget arvore(EstadoDoRecurso<List<DividendResponse>> estado) =>
        MaterialApp(
          theme: DinDinTheme.claro,
          home: Scaffold(
            body: ProventosView(estado: estado, aoRecarregar: () {}),
          ),
        );

    DividendResponse provento({
      String ticker = 'HGLG11',
      double totalAmount = 11,
      String paymentDate = '2026-09-15',
    }) => DividendResponse(
      id: 'd1',
      userId: 'u1',
      ticker: ticker,
      amountPerShare: 1.1,
      quantity: 10,
      totalAmount: totalAmount,
      paymentDate: paymentDate,
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    );

    testWidgets('lista com valor e data em pt-BR', (tester) async {
      await tester.pumpWidget(arvore(EstadoDoRecurso(dados: [provento()])));

      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.textContaining('11,00'), findsOneWidget);
      expect(find.textContaining('15/09/2026'), findsOneWidget);
    });

    testWidgets('sem provento, explica', (tester) async {
      await tester.pumpWidget(
        arvore(const EstadoDoRecurso(dados: <DividendResponse>[])),
      );

      expect(find.textContaining('Nenhum provento'), findsOneWidget);
    });
  });

  group('projetados', () {
    Widget arvore(EstadoDoRecurso<MonthlyIncomeResponse> estado) => MaterialApp(
      theme: DinDinTheme.claro,
      home: Scaffold(
        body: ProjecaoView(estado: estado, aoRecarregar: () {}),
      ),
    );

    MonthlyIncomeResponse projecao({
      List<MonthlyIncomeItem> byTicker = const [],
      double total = 0,
    }) => MonthlyIncomeResponse(
      byTicker: byTicker,
      total: total,
      totalFromFridge: 0,
    );

    testWidgets('mostra o total projetado em pt-BR', (tester) async {
      await tester.pumpWidget(
        arvore(
          EstadoDoRecurso(
            dados: projecao(
              total: 123.45,
              byTicker: const [
                MonthlyIncomeItem(
                  ticker: 'HGLG11',
                  quantity: 10,
                  monthlyDividend: 1.1,
                  monthlyIncome: 11,
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.textContaining('123,45'), findsOneWidget);
      expect(find.text('HGLG11'), findsOneWidget);
    });

    testWidgets('ativo sem provento conhecido é declarado, não zerado', (
      tester,
    ) async {
      await tester.pumpWidget(
        arvore(
          EstadoDoRecurso(
            dados: projecao(
              byTicker: const [
                MonthlyIncomeItem(
                  ticker: 'XPTO11',
                  quantity: 10,
                  monthlyDividend: 0,
                  monthlyIncome: 0,
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('sem-provento-XPTO11')), findsOneWidget);
    });

    // A premissa precisa estar visível: a projeção repete o último provento
    // real, e isso não vale para pagador trimestral nem para FII de provento
    // variável.
    testWidgets('deixa a premissa da projeção visível', (tester) async {
      await tester.pumpWidget(
        arvore(EstadoDoRecurso(dados: projecao(total: 10))),
      );

      expect(find.textContaining('último provento'), findsOneWidget);
    });
  });
}
