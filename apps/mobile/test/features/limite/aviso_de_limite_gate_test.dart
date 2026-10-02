import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/api/aviso_de_limite.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/limite/aviso_de_limite_gate.dart';

void main() {
  Widget app(AvisoDeLimite aviso) => MaterialApp(
    theme: DinDinTheme.claro,
    home: AvisoDeLimiteGate(
      aviso: aviso,
      child: const Scaffold(body: Text('conteúdo do app')),
    ),
  );

  testWidgets('não mostra nada sem 429', (tester) async {
    await tester.pumpWidget(app(AvisoDeLimite()));

    expect(find.text('conteúdo do app'), findsOneWidget);
    expect(find.byKey(const Key('aviso-de-limite')), findsNothing);
  });

  testWidgets('avisa a espera sobre qualquer tela, sem tirá-la', (
    tester,
  ) async {
    final aviso = AvisoDeLimite();
    await tester.pumpWidget(app(aviso));

    aviso.avisar(30);
    await tester.pump();

    expect(
      find.text('Muitas requisições. Aguarde 30 segundos e tente de novo.'),
      findsOneWidget,
    );
    expect(find.text('conteúdo do app'), findsOneWidget);

    aviso.dispensar();
    await tester.pump();
  });

  testWidgets('some sozinho quando a espera acaba', (tester) async {
    final aviso = AvisoDeLimite();
    await tester.pumpWidget(app(aviso));

    aviso.avisar(30);
    await tester.pump();
    await tester.pump(const Duration(seconds: 30));

    expect(find.byKey(const Key('aviso-de-limite')), findsNothing);
  });

  testWidgets('pode ser dispensado', (tester) async {
    final aviso = AvisoDeLimite();
    await tester.pumpWidget(app(aviso));
    aviso.avisar(30);
    await tester.pump();

    await tester.tap(find.byKey(const Key('aviso-de-limite-fechar')));
    await tester.pump();

    expect(find.byKey(const Key('aviso-de-limite')), findsNothing);
  });
}
