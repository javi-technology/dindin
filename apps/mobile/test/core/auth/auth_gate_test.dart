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

  Widget arvore({
    Future<void> Function(Sessao)? aoAutenticar,
    Future<void> Function()? aoEncerrar,
  }) => MaterialApp(
    home: AuthGate(
      sessoes: sessoes.stream,
      login: const Text('tela de login'),
      autenticado: const Text('tela do app'),
      aoAutenticar: aoAutenticar,
      aoEncerrar: aoEncerrar,
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

  // -------------------------------------------------------------------------
  // Provisionamento antes da primeira tela (issue #440)
  //
  // O web provisiona no guard, antes de liberar a tela. Aqui vale o mesmo
  // motivo: a tela inicial carrega as geladeiras assim que monta, e sem
  // esperar ela leria a lista vazia — o usuário cairia no beco de "crie uma
  // geladeira" mesmo com o provisionamento a caminho.
  // -------------------------------------------------------------------------
  group('provisionamento', () {
    testWidgets('espera o provisionamento antes de mostrar o app', (
      tester,
    ) async {
      final provisionado = Completer<void>();
      await tester.pumpWidget(arvore(aoAutenticar: (_) => provisionado.future));
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();

      expect(find.text('tela do app'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      provisionado.complete();
      await tester.pump();

      expect(find.text('tela do app'), findsOneWidget);
    });

    testWidgets('provisiona com a sessão recebida', (tester) async {
      final recebidas = <Sessao>[];
      await tester.pumpWidget(
        arvore(aoAutenticar: (sessao) async => recebidas.add(sessao)),
      );
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();

      expect(recebidas.map((s) => s.uid), ['u1']);
    });

    // Falhar no provisionamento não pode prender o usuário na tela de
    // carregamento: quem já tem carteira segue usando o app.
    testWidgets('mostra o app mesmo se o provisionamento falhar', (
      tester,
    ) async {
      await tester.pumpWidget(
        arvore(aoAutenticar: (_) => Future<void>.error(Exception('sem rede'))),
      );
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();
      await tester.pump();

      expect(find.text('tela do app'), findsOneWidget);
    });

    testWidgets('sem provisionador, mostra o app direto', (tester) async {
      await tester.pumpWidget(arvore());
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();

      expect(find.text('tela do app'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // Sessão que termina (issue #498)
  //
  // No celular a sessão acaba por caminhos que não são o botão de sair: token
  // revogado, conta removida, 401 que sobrevive à renovação. O que pertencia
  // ao usuário (o cache) precisa sair junto, senão o próximo a entrar no mesmo
  // aparelho vê a carteira de quem saiu.
  // -------------------------------------------------------------------------
  group('sessão encerrada', () {
    testWidgets('avisa quando a sessão termina', (tester) async {
      var encerradas = 0;
      await tester.pumpWidget(arvore(aoEncerrar: () async => encerradas++));
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();
      expect(encerradas, 0);

      sessoes.add(null);
      await tester.pump();

      expect(encerradas, 1);
    });

    // Abrir o app sem sessão é o caso em que o token foi revogado com o app
    // fechado: o cache que ficou no aparelho também precisa ser apagado.
    testWidgets('avisa também quando o app abre sem sessão', (tester) async {
      var encerradas = 0;
      await tester.pumpWidget(arvore(aoEncerrar: () async => encerradas++));

      sessoes.add(null);
      await tester.pump();

      expect(encerradas, 1);
    });

    testWidgets('não avisa de novo enquanto a sessão segue encerrada', (
      tester,
    ) async {
      var encerradas = 0;
      await tester.pumpWidget(arvore(aoEncerrar: () async => encerradas++));

      sessoes.add(null);
      await tester.pump();
      sessoes.add(null);
      await tester.pump();

      expect(encerradas, 1);
    });

    testWidgets('prepara de novo quando o mesmo usuário volta a entrar', (
      tester,
    ) async {
      final preparadas = <String>[];
      await tester.pumpWidget(
        arvore(aoAutenticar: (sessao) async => preparadas.add(sessao.uid)),
      );
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();

      sessoes.add(null);
      await tester.pump();
      sessoes.add(const Sessao(uid: 'u1', email: 'a@b.c'));
      await tester.pump();

      // O cache foi apagado ao sair: sem preparar de novo, o app mostraria a
      // tela autenticada com o cache sem dono.
      expect(preparadas, ['u1', 'u1']);
    });

    testWidgets('uma falha ao avisar não prende o login', (tester) async {
      await tester.pumpWidget(
        arvore(aoEncerrar: () => Future<void>.error(Exception('disco'))),
      );

      sessoes.add(null);
      await tester.pump();

      expect(find.text('tela de login'), findsOneWidget);
    });
  });
}
