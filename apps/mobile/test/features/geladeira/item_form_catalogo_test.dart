import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/geladeira/item_form.dart';

// ---------------------------------------------------------------------------
// Catálogo obrigatório no formulário de item da geladeira (issue #467).
//
// Mesma regra do formulário de posição: com o catálogo em mãos, só ativo dele
// vale; sem ele, o texto livre segue aceito.
// ---------------------------------------------------------------------------

Asset ativo(String ticker, String nome, AssetType tipo) => Asset(
  ticker: ticker,
  name: nome,
  assetType: tipo,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

void main() {
  final catalogo = [ativo('HGLG11', 'CSHG Logística', AssetType.fii)];

  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: SingleChildScrollView(child: filho)),
  );

  Future<CreateFridgeItemRequest?> preencherEEnviar(
    WidgetTester tester,
    String ticker,
    List<Asset> ativos,
  ) async {
    CreateFridgeItemRequest? enviado;
    await tester.pumpWidget(
      emApp(
        ItemForm(
          catalogo: ativos,
          aoSalvar: (dados) async {
            enviado = dados;
            return true;
          },
        ),
      ),
    );

    await tester.enterText(find.byKey(const Key('campo-ticker')), ticker);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-quantidade')), '5');
    await tester.enterText(
      find.byKey(const Key('campo-preco-transferencia')),
      '9,18',
    );
    await tester.enterText(find.byKey(const Key('campo-preco-alvo')), '8,50');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();
    return enviado;
  }

  testWidgets('ticker fora do catálogo é recusado antes do envio', (
    tester,
  ) async {
    final enviado = await preencherEEnviar(tester, 'ZZZZ11', catalogo);

    expect(enviado, isNull);
    expect(find.text('Escolha um ativo da lista.'), findsOneWidget);
  });

  testWidgets('ticker do catálogo é aceito', (tester) async {
    final enviado = await preencherEEnviar(tester, 'hglg11', catalogo);

    expect(enviado?.ticker, 'HGLG11');
  });

  testWidgets('sem catálogo, o ticker digitado continua valendo', (
    tester,
  ) async {
    final enviado = await preencherEEnviar(tester, 'mxrf11', const []);

    expect(enviado?.ticker, 'MXRF11');
  });
}
