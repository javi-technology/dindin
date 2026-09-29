import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/data/recurso.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/shared/components/visao_recurso.dart';

// ---------------------------------------------------------------------------
// Carregando, vazio, erro e sucesso, num lugar só (issue #402).
//
// Cada tela de consulta trata os mesmos quatro estados. Repetir isso cinco
// vezes garante que uma delas esqueça a nova tentativa — e é justamente a que
// o usuário vai abrir no metrô.
// ---------------------------------------------------------------------------
void main() {
  Widget arvore(
    EstadoDoRecurso<List<String>> estado, {
    VoidCallback? recarregar,
  }) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(
      body: VisaoRecurso<List<String>>(
        estado: estado,
        aoRecarregar: recarregar ?? () {},
        vazio: (context) => const Text('nada por aqui'),
        estaVazio: (dados) => dados.isEmpty,
        // O conteúdo é rolável por contrato: é o que habilita o
        // puxar-para-atualizar.
        conteudo: (context, dados) =>
            ListView(children: [Text(dados.join(', '))]),
      ),
    ),
  );

  testWidgets('carregando sem dado mostra o indicador', (tester) async {
    await tester.pumpWidget(arvore(const EstadoDoRecurso(carregando: true)));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('sucesso mostra o conteúdo', (tester) async {
    await tester.pumpWidget(
      arvore(const EstadoDoRecurso(dados: ['HGLG11', 'MXRF11'])),
    );

    expect(find.text('HGLG11, MXRF11'), findsOneWidget);
  });

  // Lista vazia e falha de carregamento são coisas diferentes: tratar as duas
  // como tela em branco faz o usuário achar que perdeu dado quando só não
  // cadastrou nada.
  testWidgets('lista vazia mostra o estado vazio, não erro', (tester) async {
    await tester.pumpWidget(arvore(const EstadoDoRecurso(dados: <String>[])));

    expect(find.text('nada por aqui'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsNothing);
  });

  group('erro', () {
    testWidgets('sem dado, mostra a mensagem e a nova tentativa', (
      tester,
    ) async {
      var tentativas = 0;
      await tester.pumpWidget(
        arvore(
          const EstadoDoRecurso(erro: 'Sem conexão com o servidor.'),
          recarregar: () => tentativas++,
        ),
      );

      expect(find.text('Sem conexão com o servidor.'), findsOneWidget);

      await tester.tap(find.text('Tentar de novo'));
      expect(tentativas, 1);
    });

    // Com dado em mãos, trocar a tela por um erro apagaria o que o usuário
    // consegue usar. O erro vira aviso, e o conteúdo continua.
    testWidgets('com dado do cache, mantém o conteúdo e avisa', (tester) async {
      await tester.pumpWidget(
        arvore(
          EstadoDoRecurso(
            dados: const ['HGLG11'],
            erro: 'Sem conexão com o servidor.',
            doCache: true,
            atualizadoEm: DateTime(2026, 9, 27, 14, 30),
          ),
        ),
      );

      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.byKey(const Key('aviso-cache')), findsOneWidget);
    });
  });

  group('aviso de dado do cache', () {
    testWidgets('aparece quando o dado veio do disco', (tester) async {
      await tester.pumpWidget(
        arvore(
          EstadoDoRecurso(
            dados: const ['HGLG11'],
            carregando: true,
            doCache: true,
            atualizadoEm: DateTime(2026, 9, 27, 14, 30),
          ),
        ),
      );

      expect(find.byKey(const Key('aviso-cache')), findsOneWidget);
      expect(find.textContaining('27/09'), findsOneWidget);
    });

    testWidgets('some quando a rede responde', (tester) async {
      await tester.pumpWidget(
        arvore(
          EstadoDoRecurso(
            dados: const ['HGLG11'],
            atualizadoEm: DateTime.now(),
          ),
        ),
      );

      expect(find.byKey(const Key('aviso-cache')), findsNothing);
    });
  });
}
