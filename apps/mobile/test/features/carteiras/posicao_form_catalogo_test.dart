import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/carteiras/posicao_form.dart';

// ---------------------------------------------------------------------------
// Catálogo de ativos no formulário de posição (issue #443).
//
// O ticker era um campo de texto livre, e a API recusa o que não está no
// catálogo: o erro só voltava depois do envio, e no teclado do celular errar
// o ticker é fácil. O catálogo é ajuda, não barreira — sem ele em mãos, o
// campo continua aceitando digitação.
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
  final catalogo = [
    ativo('HGLG11', 'CSHG Logística', AssetType.fii),
    ativo('HGRU11', 'CSHG Renda Urbana', AssetType.fii),
    ativo('ITUB4', 'Itaú Unibanco', AssetType.stock),
  ];

  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: SingleChildScrollView(child: filho)),
  );

  Future<void> digitarTicker(WidgetTester tester, String texto) async {
    await tester.enterText(find.byKey(const Key('campo-ticker')), texto);
    await tester.pumpAndSettle();
  }

  testWidgets('sugere os ativos do catálogo pelo que foi digitado', (
    tester,
  ) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    await digitarTicker(tester, 'HG');

    expect(find.text('HGLG11'), findsOneWidget);
    expect(find.text('HGRU11'), findsOneWidget);
    // O que não casa fica de fora: uma lista com o catálogo inteiro não ajuda
    // ninguém a achar o ativo.
    expect(find.text('ITUB4'), findsNothing);
  });

  testWidgets('busca também pelo nome do ativo', (tester) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    await digitarTicker(tester, 'itaú');

    expect(find.text('ITUB4'), findsOneWidget);
  });

  // O tipo vem do catálogo: pedir que o usuário repita uma informação que o
  // app já tem é convite a registrar FII como ação.
  testWidgets('escolher o ativo preenche ticker e tipo', (tester) async {
    CreatePositionRequest? enviado;
    await tester.pumpWidget(
      emApp(
        PosicaoForm(
          aoSalvar: (dados) async {
            enviado = dados;
            return true;
          },
          catalogo: catalogo,
        ),
      ),
    );

    await digitarTicker(tester, 'ITUB');
    await tester.tap(find.text('ITUB4').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('campo-quantidade')), '10');
    await tester.enterText(find.byKey(const Key('campo-preco')), '34,12');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    expect(enviado?.ticker, 'ITUB4');
    expect(enviado?.assetType, AssetType.stock);
  });

  // Sem rede e sem cache o catálogo chega vazio; o formulário não pode virar
  // um beco por causa disso.
  testWidgets('sem catálogo, o ticker digitado continua valendo', (
    tester,
  ) async {
    CreatePositionRequest? enviado;
    await tester.pumpWidget(
      emApp(
        PosicaoForm(
          aoSalvar: (dados) async {
            enviado = dados;
            return true;
          },
          catalogo: const [],
        ),
      ),
    );

    await digitarTicker(tester, 'mxrf11');
    await tester.enterText(find.byKey(const Key('campo-quantidade')), '5');
    await tester.enterText(find.byKey(const Key('campo-preco')), '9,18');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    expect(enviado?.ticker, 'MXRF11');
  });

  // ---- Catálogo obrigatório (issue #467) ----
  //
  // Sugerir não bastava: o campo seguia aceitando qualquer texto, e o erro só
  // voltava da API depois do envio. O web usa um select fechado; o app faz o
  // mesmo quando tem o catálogo em mãos.

  testWidgets('ao focar o campo vazio, lista o catálogo inteiro', (
    tester,
  ) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    await tester.tap(find.byKey(const Key('campo-ticker')));
    await tester.pumpAndSettle();

    expect(find.text('HGLG11'), findsOneWidget);
    expect(find.text('HGRU11'), findsOneWidget);
    expect(find.text('ITUB4'), findsOneWidget);
  });

  testWidgets('ticker fora do catálogo é recusado antes do envio', (
    tester,
  ) async {
    var chamadas = 0;
    await tester.pumpWidget(
      emApp(
        PosicaoForm(
          aoSalvar: (_) async {
            chamadas++;
            return true;
          },
          catalogo: catalogo,
        ),
      ),
    );

    await digitarTicker(tester, 'ZZZZ11');
    await tester.enterText(find.byKey(const Key('campo-quantidade')), '5');
    await tester.enterText(find.byKey(const Key('campo-preco')), '9,18');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    expect(chamadas, 0);
    expect(find.text('Escolha um ativo da lista.'), findsOneWidget);
  });

  // Quem digita o ticker inteiro sem tocar na sugestão não pode ficar sem o
  // tipo do ativo nem ser barrado por causa das maiúsculas.
  testWidgets('ticker digitado igual ao do catálogo vale e traz o tipo', (
    tester,
  ) async {
    CreatePositionRequest? enviado;
    await tester.pumpWidget(
      emApp(
        PosicaoForm(
          aoSalvar: (dados) async {
            enviado = dados;
            return true;
          },
          catalogo: catalogo,
        ),
      ),
    );

    await digitarTicker(tester, 'itub4');
    await tester.enterText(find.byKey(const Key('campo-quantidade')), '10');
    await tester.enterText(find.byKey(const Key('campo-preco')), '34,12');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    expect(enviado?.ticker, 'ITUB4');
    expect(enviado?.assetType, AssetType.stock);
  });

  // ---- Botão e mensagem enquanto digita (review da #468) ----
  //
  // O critério da issue é botão indisponível e mensagem no campo; a mensagem
  // só aparecia depois de tocar em Salvar.

  bool salvarDisponivel(WidgetTester tester) =>
      tester
          .widget<FilledButton>(find.byKey(const Key('botao-salvar')))
          .onPressed !=
      null;

  testWidgets('ticker inválido digitado desabilita Salvar e avisa no campo', (
    tester,
  ) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    await digitarTicker(tester, 'ZZZZ11');

    expect(salvarDisponivel(tester), isFalse);
    expect(find.text('Escolha um ativo da lista.'), findsOneWidget);
  });

  testWidgets('ticker do catálogo mantém Salvar disponível', (tester) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    await digitarTicker(tester, 'itub4');

    expect(salvarDisponivel(tester), isTrue);
  });

  // Campo vazio não desabilita: o botão sem explicação deixaria o usuário sem
  // saber o que falta; tocar mostra "Informe o ticker.".
  testWidgets('campo vazio não desabilita Salvar', (tester) async {
    await tester.pumpWidget(
      emApp(PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo)),
    );

    expect(salvarDisponivel(tester), isTrue);
  });

  testWidgets('sem catálogo, Salvar segue disponível com qualquer ticker', (
    tester,
  ) async {
    await tester.pumpWidget(emApp(PosicaoForm(aoSalvar: (_) async => true)));

    await digitarTicker(tester, 'ZZZZ11');

    expect(salvarDisponivel(tester), isTrue);
  });

  testWidgets('edição de ativo removido do catálogo mantém Salvar disponível', (
    tester,
  ) async {
    await tester.pumpWidget(
      emApp(
        PosicaoForm(
          aoSalvar: (_) async => true,
          catalogo: catalogo,
          posicaoInicial: Position(
            id: 'p1',
            walletId: 'w1',
            ticker: 'OLDD11',
            assetType: AssetType.fii,
            quantity: 3,
            averagePrice: 10,
            inFridge: false,
            createdAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-01T00:00:00Z',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(salvarDisponivel(tester), isTrue);
  });

  // ---- Atualização não reenvia o ticker inalterado (review da #468) ----
  //
  // A API valida contra os ativos ATIVOS todo ticker recebido. Reenviar o que
  // não mudou faria a correção de quantidade de um ativo desativado dar 400.

  test('atualização omite o ticker quando ele não mudou', () {
    final original = Position(
      id: 'p1',
      walletId: 'w1',
      ticker: 'OLDD11',
      assetType: AssetType.fii,
      quantity: 3,
      averagePrice: 10,
      inFridge: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final pedido = pedidoDeAtualizacaoDePosicao(
      original,
      const CreatePositionRequest(
        ticker: 'OLDD11',
        assetType: AssetType.fii,
        quantity: 5,
        averagePrice: 10,
      ),
    );

    expect(pedido.ticker, isNull);
    expect(pedido.toJson().containsKey('ticker'), isFalse);
    expect(pedido.quantity, 5);
  });

  test('atualização envia o ticker quando ele mudou', () {
    final original = Position(
      id: 'p1',
      walletId: 'w1',
      ticker: 'OLDD11',
      assetType: AssetType.fii,
      quantity: 3,
      averagePrice: 10,
      inFridge: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final pedido = pedidoDeAtualizacaoDePosicao(
      original,
      const CreatePositionRequest(
        ticker: 'HGLG11',
        assetType: AssetType.fii,
        quantity: 3,
        averagePrice: 10,
      ),
    );

    expect(pedido.ticker, 'HGLG11');
  });

  testesDeCursor();
}

// ---------------------------------------------------------------------------
// Cursor preservado ao reconstruir (issue #448, achado do review)
//
// O campo copiava o valor entre dois controllers a cada `build`, o que joga o
// cursor para o fim: corrigir uma letra no meio do ticker ficava impossível,
// porque a próxima reconstrução movia o ponto de inserção.
// ---------------------------------------------------------------------------
void testesDeCursor() {
  testWidgets('mantém o cursor onde o usuário o deixou', (tester) async {
    final catalogo = [ativo('HGLG11', 'CSHG Logística', AssetType.fii)];

    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: PosicaoForm(aoSalvar: (_) async => true, catalogo: catalogo),
        ),
      ),
    );

    final campo = find.byKey(const Key('campo-ticker'));
    await tester.enterText(campo, 'HGLG11');
    await tester.pumpAndSettle();

    // Cursor no meio do texto, como quem volta para corrigir uma letra.
    final estado = tester.widget<TextFormField>(campo);
    estado.controller!.selection = const TextSelection.collapsed(offset: 2);
    await tester.pump();

    // Qualquer reconstrução: mudar o catálogo basta.
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: PosicaoForm(
            aoSalvar: (_) async => true,
            catalogo: [...catalogo, ativo('MXRF11', 'Maxi', AssetType.fii)],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      tester.widget<TextFormField>(campo).controller!.selection.baseOffset,
      2,
    );
  });
}
