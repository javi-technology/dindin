import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/carteiras/carteiras_view.dart';
import 'package:dindin_mobile/shared/components/acoes_do_item.dart';

// ---------------------------------------------------------------------------
// Editar e excluir a partir da lista (issue #403).
//
// Exclusão exige confirmação explícita, no componente do app e nunca no
// diálogo nativo: apagar posição é apagar dado financeiro, e o nativo dá o
// mesmo peso visual ao "OK" e ao "Cancelar".
// ---------------------------------------------------------------------------
Wallet carteira({String nome = 'Principal'}) => Wallet(
  id: 'w1',
  ownerId: 'u1',
  name: nome,
  currency: 'BRL',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
);

void main() {
  group('AcoesDoItem', () {
    Future<void> montar(
      WidgetTester tester, {
      VoidCallback? aoEditar,
      Future<void> Function()? aoExcluir,
      String titulo = 'Excluir carteira',
    }) => tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: AcoesDoItem(
            aoEditar: aoEditar,
            aoExcluir: aoExcluir,
            tituloDaExclusao: titulo,
            mensagemDaExclusao: 'Esta ação não pode ser desfeita.',
          ),
        ),
      ),
    );

    Future<void> abrirMenu(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('acoes-do-item')));
      await tester.pumpAndSettle();
    }

    testWidgets('editar chama a ação', (tester) async {
      var edicoes = 0;
      await montar(tester, aoEditar: () => edicoes++, aoExcluir: () async {});
      await abrirMenu(tester);

      await tester.tap(find.text('Editar'));
      await tester.pumpAndSettle();

      expect(edicoes, 1);
    });

    testWidgets('excluir pede confirmação antes de agir', (tester) async {
      var exclusoes = 0;
      await montar(tester, aoExcluir: () async => exclusoes++);
      await abrirMenu(tester);

      await tester.tap(find.text('Excluir'));
      await tester.pumpAndSettle();

      expect(find.text('Excluir carteira'), findsOneWidget);
      expect(exclusoes, 0);
    });

    testWidgets('confirmar exclui', (tester) async {
      var exclusoes = 0;
      await montar(tester, aoExcluir: () async => exclusoes++);
      await abrirMenu(tester);
      await tester.tap(find.text('Excluir'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('botao-confirmar')));
      await tester.pumpAndSettle();

      expect(exclusoes, 1);
    });

    testWidgets('cancelar não exclui', (tester) async {
      var exclusoes = 0;
      await montar(tester, aoExcluir: () async => exclusoes++);
      await abrirMenu(tester);
      await tester.tap(find.text('Excluir'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('botao-cancelar')));
      await tester.pumpAndSettle();

      expect(exclusoes, 0);
    });

    testWidgets('sem ação de excluir, o item não aparece no menu', (
      tester,
    ) async {
      await montar(tester, aoEditar: () {});
      await abrirMenu(tester);

      expect(find.text('Excluir'), findsNothing);
    });
  });

  group('lista de carteiras', () {
    testWidgets('oferece editar e excluir em cada linha', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: DinDinTheme.claro,
          home: Scaffold(
            body: CarteirasView(
              estado: EstadoDoRecurso(dados: [carteira()]),
              aoRecarregar: () {},
              aoAbrir: (_) {},
              aoEditar: (_) {},
              aoExcluir: (_) async {},
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('acoes-do-item')), findsOneWidget);
    });

    testWidgets('sem as ações, a linha não mostra o menu', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: DinDinTheme.claro,
          home: Scaffold(
            body: CarteirasView(
              estado: EstadoDoRecurso(dados: [carteira()]),
              aoRecarregar: () {},
              aoAbrir: (_) {},
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('acoes-do-item')), findsNothing);
    });
  });
}
