import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/auth/auth_gate.dart';
import 'package:dindin_mobile/core/auth/sessao.dart';

// ---------------------------------------------------------------------------
// Quem decide entre login e app é a sessão (issue #400). Resposta 401 leva à
// tela de login — e sem deixar tela intermediária em estado inconsistente,
// que no celular é o caso comum: a sessão expira enquanto o app está aberto.
// ---------------------------------------------------------------------------
void main() {
  late StreamController<Sessao?> sessoes;

  setUp(() => sessoes = StreamController<Sessao?>.broadcast());
  tearDown(() => sessoes.close());

  Widget arvore() => MaterialApp(
    home: AuthGate(
      sessoes: sessoes.stream,
      login: const Text('tela de login'),
      autenticado: const Text('tela do app'),
    ),
  );

  testWidgets('mostra carregamento enquanto a sessão não chegou', (
    tester,
  ) async {
    await tester.pumpWidget(arvore());

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('tela de login'), findsNothing);
  });

  testWidgets('sem sessão, mostra o login', (tester) async {
    await tester.pumpWidget(arvore());
    sessoes.add(null);
    await tester.pump();

    expect(find.text('tela de login'), findsOneWidget);
  });

  testWidgets('com sessão, mostra o app', (tester) async {
    await tester.pumpWidget(arvore());
    sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
    await tester.pump();

    expect(find.text('tela do app'), findsOneWidget);
  });

  testWidgets('sessão encerrada volta ao login sem deixar a tela anterior', (
    tester,
  ) async {
    await tester.pumpWidget(arvore());
    sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
    await tester.pump();

    sessoes.add(null);
    await tester.pump();

    expect(find.text('tela de login'), findsOneWidget);
    expect(find.text('tela do app'), findsNothing);
  });
}
