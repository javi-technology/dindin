import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/patrimonio/patrimonio_view.dart';

// ---------------------------------------------------------------------------
// Resumo do patrimônio (issue #402).
//
// É a primeira tela do app e a razão de abri-lo. Valores em pt-BR, e ativo
// sem cotação sinalizado — nunca como zero, que num app financeiro é um
// número e o usuário o lê como tal.
// ---------------------------------------------------------------------------
void main() {
  Widget arvore(EstadoDoRecurso<DashboardSummaryResponse> estado) =>
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: PatrimonioView(estado: estado, aoRecarregar: () {}),
        ),
      );

  DashboardSummaryResponse resumo({
    double totalWallet = 1000,
    double totalFridge = 250.5,
    double monthlyIncomeTotal = 12.75,
    List<TickerValue> composition = const [],
  }) => DashboardSummaryResponse(
    totalWallet: totalWallet,
    totalFridge: totalFridge,
    total: totalWallet + totalFridge,
    monthlyIncomeTotal: monthlyIncomeTotal,
    composition: composition,
  );

  testWidgets('mostra os totais no padrão brasileiro', (tester) async {
    await tester.pumpWidget(arvore(EstadoDoRecurso(dados: resumo())));

    // `250,50` é substring de `1.250,50`, então o total é conferido pela
    // própria chave, e não por busca de texto.
    final total = tester.widget<Text>(
      find.byKey(const Key('total-patrimonio')),
    );
    expect(total.data, 'R\$\u00A01.250,50');

    expect(find.text('R\$\u00A01.000,00'), findsOneWidget);
    expect(find.text('R\$\u00A0250,50'), findsOneWidget);
    expect(find.text('R\$\u00A012,75'), findsOneWidget);
  });

  testWidgets('lista a composição em ordem de valor', (tester) async {
    await tester.pumpWidget(
      arvore(
        EstadoDoRecurso(
          dados: resumo(
            composition: const [
              TickerValue(ticker: 'HGLG11', value: 800),
              TickerValue(ticker: 'MXRF11', value: 200),
            ],
          ),
        ),
      ),
    );

    expect(find.text('HGLG11'), findsOneWidget);
    expect(find.text('MXRF11'), findsOneWidget);
  });

  testWidgets('carregando mostra o indicador', (tester) async {
    await tester.pumpWidget(arvore(const EstadoDoRecurso(carregando: true)));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('erro oferece nova tentativa', (tester) async {
    await tester.pumpWidget(
      arvore(const EstadoDoRecurso(erro: 'Sem conexão com o servidor.')),
    );

    expect(find.text('Tentar de novo'), findsOneWidget);
  });

  testWidgets('sem patrimônio, explica em vez de mostrar tela vazia', (
    tester,
  ) async {
    await tester.pumpWidget(
      arvore(
        EstadoDoRecurso(
          dados: resumo(totalWallet: 0, totalFridge: 0, monthlyIncomeTotal: 0),
        ),
      ),
    );

    expect(find.textContaining('Nenhuma posição'), findsOneWidget);
  });
}
