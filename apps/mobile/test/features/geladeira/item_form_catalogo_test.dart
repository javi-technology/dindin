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

  // ---- Botão e mensagem enquanto digita; ticker inalterado (review da #468) ----

  Widget itemForm(List<Asset> ativos, {FridgeItem? inicial}) => emApp(
    ItemForm(
      catalogo: ativos,
      itemInicial: inicial,
      aoSalvar: (_) async => true,
    ),
  );

  bool salvarDisponivel(WidgetTester tester) =>
      tester
          .widget<FilledButton>(find.byKey(const Key('botao-salvar')))
          .onPressed !=
      null;

  testWidgets('ticker inválido digitado desabilita Salvar e avisa no campo', (
    tester,
  ) async {
    await tester.pumpWidget(itemForm(catalogo));
    await tester.enterText(find.byKey(const Key('campo-ticker')), 'ZZZZ11');
    await tester.pumpAndSettle();

    expect(salvarDisponivel(tester), isFalse);
    expect(find.text('Escolha um ativo da lista.'), findsOneWidget);
  });

  testWidgets('ticker do catálogo mantém Salvar disponível', (tester) async {
    await tester.pumpWidget(itemForm(catalogo));
    await tester.enterText(find.byKey(const Key('campo-ticker')), 'hglg11');
    await tester.pumpAndSettle();

    expect(salvarDisponivel(tester), isTrue);
  });

  testWidgets('campo vazio não desabilita Salvar', (tester) async {
    await tester.pumpWidget(itemForm(catalogo));

    expect(salvarDisponivel(tester), isTrue);
  });

  testWidgets('edição de ativo removido do catálogo mantém Salvar disponível', (
    tester,
  ) async {
    await tester.pumpWidget(
      itemForm(
        catalogo,
        inicial: const FridgeItem(
          id: 'i1',
          fridgeId: 'g1',
          ticker: 'OLDD11',
          quantity: 3,
          transferredPrice: 10,
          targetPrice: 9,
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(salvarDisponivel(tester), isTrue);
  });

  test('atualização omite o ticker quando ele não mudou', () {
    const original = FridgeItem(
      id: 'i1',
      fridgeId: 'g1',
      ticker: 'OLDD11',
      quantity: 3,
      transferredPrice: 10,
      targetPrice: 9,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final pedido = pedidoDeAtualizacaoDeItem(
      original,
      const CreateFridgeItemRequest(
        ticker: 'OLDD11',
        quantity: 4,
        transferredPrice: 10,
        targetPrice: 9,
      ),
    );

    expect(pedido.ticker, isNull);
    expect(pedido.toJson().containsKey('ticker'), isFalse);
    expect(pedido.quantity, 4);
  });

  test('atualização envia o ticker quando ele mudou', () {
    const original = FridgeItem(
      id: 'i1',
      fridgeId: 'g1',
      ticker: 'OLDD11',
      quantity: 3,
      transferredPrice: 10,
      targetPrice: 9,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final pedido = pedidoDeAtualizacaoDeItem(
      original,
      const CreateFridgeItemRequest(
        ticker: 'HGLG11',
        quantity: 3,
        transferredPrice: 10,
        targetPrice: 9,
      ),
    );

    expect(pedido.ticker, 'HGLG11');
  });
}
