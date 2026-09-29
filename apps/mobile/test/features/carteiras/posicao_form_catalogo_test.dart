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
