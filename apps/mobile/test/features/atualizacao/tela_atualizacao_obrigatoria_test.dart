import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/api/atualizacao_obrigatoria.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/atualizacao/atualizacao_gate.dart';

void main() {
  Widget app(AtualizacaoObrigatoria atualizacao) => MaterialApp(
    theme: DinDinTheme.claro,
    home: AtualizacaoGate(
      atualizacao: atualizacao,
      child: const Scaffold(body: Text('conteúdo do app')),
    ),
  );

  testWidgets('mostra o app enquanto a atualização não é exigida', (
    tester,
  ) async {
    await tester.pumpWidget(app(AtualizacaoObrigatoria()));

    expect(find.text('conteúdo do app'), findsOneWidget);
    expect(find.text('Atualize o DinDin'), findsNothing);
  });

  testWidgets('troca o app pela tela de atualização quando é exigida', (
    tester,
  ) async {
    final atualizacao = AtualizacaoObrigatoria();
    await tester.pumpWidget(app(atualizacao));

    atualizacao.exigir();
    await tester.pump();

    expect(find.text('Atualize o DinDin'), findsOneWidget);
    expect(find.textContaining('App Store ou Google Play'), findsOneWidget);
    expect(find.text('conteúdo do app'), findsNothing);
  });
}
