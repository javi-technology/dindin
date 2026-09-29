import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/auth/auth_exception.dart';
import 'package:dindin_mobile/features/auth/login_screen.dart';

// ---------------------------------------------------------------------------
// Tela de login do app (issue #400).
//
// Testes browserless: nada de navegador, só jsdom-equivalente do Flutter. O
// que se verifica é o contrato da tela com quem a usa — não o desenho.
// ---------------------------------------------------------------------------

class _AcoesFalsas {
  final List<(String, String)> entradas = [];
  int cliquesNoGoogle = 0;
  Object? erroAoEntrar;

  /// Quando presente, o envio só termina quando o teste o completar — é o
  /// que reproduz a espera da rede, onde o toque duplo acontece.
  Completer<void>? emAndamento;

  Future<void> comEmail(String email, String senha) async {
    entradas.add((email, senha));
    if (emAndamento != null) await emAndamento!.future;
    if (erroAoEntrar != null) throw erroAoEntrar!;
  }

  Future<void> comGoogle() async {
    cliquesNoGoogle++;
    if (erroAoEntrar != null) throw erroAoEntrar!;
  }
}

void main() {
  late _AcoesFalsas acoes;

  setUp(() => acoes = _AcoesFalsas());

  Future<void> montar(WidgetTester tester) => tester.pumpWidget(
    MaterialApp(
      home: LoginScreen(
        aoEntrarComEmail: acoes.comEmail,
        aoEntrarComGoogle: acoes.comGoogle,
      ),
    ),
  );

  Future<void> preencher(
    WidgetTester tester, {
    String email = 'a@b.c',
    String senha = 'segredo',
  }) async {
    await tester.enterText(find.byKey(const Key('campo-email')), email);
    await tester.enterText(find.byKey(const Key('campo-senha')), senha);
  }

  testWidgets('entra com e-mail e senha', (tester) async {
    await montar(tester);
    await preencher(tester);

    await tester.tap(find.byKey(const Key('botao-entrar')));
    await tester.pumpAndSettle();

    expect(acoes.entradas, [('a@b.c', 'segredo')]);
  });

  testWidgets('entra com Google', (tester) async {
    await montar(tester);

    await tester.tap(find.byKey(const Key('botao-google')));
    await tester.pumpAndSettle();

    expect(acoes.cliquesNoGoogle, 1);
  });

  group('validação', () {
    testWidgets('não envia sem e-mail', (tester) async {
      await montar(tester);
      await preencher(tester, email: '');

      await tester.tap(find.byKey(const Key('botao-entrar')));
      await tester.pumpAndSettle();

      expect(acoes.entradas, isEmpty);
      expect(find.text('Informe o e-mail.'), findsOneWidget);
    });

    testWidgets('não envia com e-mail malformado', (tester) async {
      await montar(tester);
      await preencher(tester, email: 'sem-arroba');

      await tester.tap(find.byKey(const Key('botao-entrar')));
      await tester.pumpAndSettle();

      expect(acoes.entradas, isEmpty);
      expect(find.text('E-mail inválido.'), findsOneWidget);
    });

    testWidgets('não envia sem senha', (tester) async {
      await montar(tester);
      await preencher(tester, senha: '');

      await tester.tap(find.byKey(const Key('botao-entrar')));
      await tester.pumpAndSettle();

      expect(acoes.entradas, isEmpty);
      expect(find.text('Informe a senha.'), findsOneWidget);
    });
  });

  group('erro', () {
    testWidgets('mostra a mensagem em português', (tester) async {
      acoes.erroAoEntrar = const AuthException('E-mail ou senha inválidos.');
      await montar(tester);
      await preencher(tester);

      await tester.tap(find.byKey(const Key('botao-entrar')));
      await tester.pumpAndSettle();

      expect(find.text('E-mail ou senha inválidos.'), findsOneWidget);
    });

    // Desistir da folha do Google é normal; mostrar erro vermelho para isso
    // faz o app parecer quebrado quando nada deu errado.
    testWidgets('cancelamento do Google não vira erro na tela', (tester) async {
      acoes.erroAoEntrar = const LoginCanceladoException();
      await montar(tester);

      await tester.tap(find.byKey(const Key('botao-google')));
      await tester.pumpAndSettle();

      expect(find.text('Login cancelado.'), findsNothing);
    });

    testWidgets('preserva o que foi digitado', (tester) async {
      acoes.erroAoEntrar = const AuthException('E-mail ou senha inválidos.');
      await montar(tester);
      await preencher(tester);

      await tester.tap(find.byKey(const Key('botao-entrar')));
      await tester.pumpAndSettle();

      expect(find.text('a@b.c'), findsOneWidget);
    });
  });

  // Toque duplo no botão é o caso comum no celular, quando a resposta demora
  // e o usuário acha que não funcionou.
  testWidgets('não envia duas vezes enquanto a primeira não responde', (
    tester,
  ) async {
    final resposta = Completer<void>();
    acoes.emAndamento = resposta;
    await montar(tester);
    await preencher(tester);

    await tester.tap(find.byKey(const Key('botao-entrar')));
    await tester.pump();

    await tester.tap(
      find.byKey(const Key('botao-entrar')),
      warnIfMissed: false,
    );
    await tester.pump();

    expect(acoes.entradas, hasLength(1));

    resposta.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('o botão fica indisponível durante o envio', (tester) async {
    final resposta = Completer<void>();
    acoes.emAndamento = resposta;
    await montar(tester);
    await preencher(tester);

    await tester.tap(find.byKey(const Key('botao-entrar')));
    await tester.pump();

    final botao = tester.widget<FilledButton>(
      find.byKey(const Key('botao-entrar')),
    );
    expect(botao.onPressed, isNull);

    resposta.complete();
    await tester.pumpAndSettle();
  });
}
