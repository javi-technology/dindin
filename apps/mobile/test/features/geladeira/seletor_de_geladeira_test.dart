import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/geladeira/seletor_de_geladeira.dart';

// ---------------------------------------------------------------------------
// Escolha e gestão da geladeira aberta (issue #444).
//
// Com mais de uma geladeira, o app precisa dizer qual está em tela e deixar
// trocar — antes ele abria a primeira e não havia como chegar às outras. As
// ações de criar, renomear e excluir moram aqui, junto do nome, que é onde o
// usuário procura por elas.
// ---------------------------------------------------------------------------

Fridge geladeira(String id, String nome) => Fridge(
  id: id,
  ownerId: 'u1',
  name: nome,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
);

void main() {
  final geladeiras = [
    geladeira('g1', 'Geladeira Principal'),
    geladeira('g2', 'Geladeira de FIIs'),
  ];

  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: filho),
  );

  testWidgets('mostra o nome da geladeira aberta', (tester) async {
    await tester.pumpWidget(
      emApp(
        SeletorDeGeladeira(
          geladeiras: geladeiras,
          aberta: geladeiras[1],
          aoTrocar: (_) {},
          aoCriar: () {},
          aoRenomear: () {},
          aoExcluir: () {},
        ),
      ),
    );

    expect(find.text('Geladeira de FIIs'), findsOneWidget);
  });

  testWidgets('permite trocar de geladeira quando há mais de uma', (
    tester,
  ) async {
    String? trocada;
    await tester.pumpWidget(
      emApp(
        SeletorDeGeladeira(
          geladeiras: geladeiras,
          aberta: geladeiras[0],
          aoTrocar: (g) => trocada = g.id,
          aoCriar: () {},
          aoRenomear: () {},
          aoExcluir: () {},
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('trocar-geladeira')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Geladeira de FIIs').last);
    await tester.pumpAndSettle();

    expect(trocada, 'g2');
  });

  // Com uma geladeira só, o seletor seria um menu de um item — ruído numa
  // tela de celular.
  testWidgets('não oferece troca quando só existe uma', (tester) async {
    await tester.pumpWidget(
      emApp(
        SeletorDeGeladeira(
          geladeiras: [geladeiras.first],
          aberta: geladeiras.first,
          aoTrocar: (_) {},
          aoCriar: () {},
          aoRenomear: () {},
          aoExcluir: () {},
        ),
      ),
    );

    expect(find.byKey(const Key('trocar-geladeira')), findsNothing);
  });

  testWidgets('oferece criar, renomear e excluir', (tester) async {
    final acoes = <String>[];
    await tester.pumpWidget(
      emApp(
        SeletorDeGeladeira(
          geladeiras: geladeiras,
          aberta: geladeiras.first,
          aoTrocar: (_) {},
          aoCriar: () => acoes.add('criar'),
          aoRenomear: () => acoes.add('renomear'),
          aoExcluir: () => acoes.add('excluir'),
        ),
      ),
    );

    for (final rotulo in ['Nova geladeira', 'Renomear', 'Excluir']) {
      await tester.tap(find.byKey(const Key('acoes-geladeira')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(rotulo));
      await tester.pumpAndSettle();
    }

    expect(acoes, ['criar', 'renomear', 'excluir']);
  });
}
