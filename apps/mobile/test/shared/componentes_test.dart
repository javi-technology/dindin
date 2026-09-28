import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/core/theme/dindin_tokens.dart';
import 'package:dindin_mobile/shared/components/campo_moeda.dart';
import 'package:dindin_mobile/shared/components/cartao.dart';
import 'package:dindin_mobile/shared/components/confirmar_dialog.dart';
import 'package:dindin_mobile/shared/components/estado_carregando.dart';
import 'package:dindin_mobile/shared/components/estado_erro.dart';
import 'package:dindin_mobile/shared/components/estado_vazio.dart';

// ---------------------------------------------------------------------------
// Componentes comuns do app (issue #401).
//
// Um app sem eles acumula botão, campo e cartão ligeiramente diferentes em
// cada tela, e padronizar depois custa mais do que fazer agora. Estes testes
// fixam o contrato de cada um — o que a tela informa e o que ele devolve —,
// não o desenho.
// ---------------------------------------------------------------------------

Widget _emApp(Widget filho) =>
    MaterialApp(theme: DinDinTheme.claro, home: Scaffold(body: filho));

void main() {
  group('CampoMoeda', () {
    testWidgets('entrega o valor com vírgula decimal como número', (
      tester,
    ) async {
      double? recebido;
      await tester.pumpWidget(
        _emApp(
          CampoMoeda(rotulo: 'Preço', aoMudar: (valor) => recebido = valor),
        ),
      );

      await tester.enterText(find.byType(TextFormField), '1,55');
      await tester.pump();

      expect(recebido, 1.55);
    });

    testWidgets('exibe o valor inicial no padrão brasileiro', (tester) async {
      await tester.pumpWidget(
        _emApp(CampoMoeda(rotulo: 'Preço', valor: 1500.55, aoMudar: (_) {})),
      );

      expect(find.text('1.500,55'), findsOneWidget);
    });

    testWidgets('recusa texto que não é número', (tester) async {
      await tester.pumpWidget(
        _emApp(
          Form(child: CampoMoeda(rotulo: 'Preço', aoMudar: (_) {})),
        ),
      );

      await tester.enterText(find.byType(TextFormField), 'abc');
      await tester.pump();

      final campo = tester.widget<TextFormField>(find.byType(TextFormField));
      expect(campo.validator!('abc'), isNotNull);
    });

    testWidgets('exige valor quando obrigatório', (tester) async {
      await tester.pumpWidget(
        _emApp(
          CampoMoeda(rotulo: 'Preço', obrigatorio: true, aoMudar: (_) {}),
        ),
      );

      final campo = tester.widget<TextFormField>(find.byType(TextFormField));
      expect(campo.validator!(''), 'Informe o valor.');
    });
  });

  group('estados da tela', () {
    testWidgets('carregando mostra o indicador', (tester) async {
      await tester.pumpWidget(_emApp(const EstadoCarregando()));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('vazio explica e oferece a ação', (tester) async {
      var cliques = 0;
      await tester.pumpWidget(
        _emApp(
          EstadoVazio(
            titulo: 'Nenhuma carteira',
            descricao: 'Crie a primeira para começar.',
            rotuloAcao: 'Criar carteira',
            aoAgir: () => cliques++,
          ),
        ),
      );

      expect(find.text('Nenhuma carteira'), findsOneWidget);
      expect(find.text('Crie a primeira para começar.'), findsOneWidget);

      await tester.tap(find.text('Criar carteira'));
      expect(cliques, 1);
    });

    testWidgets('vazio funciona sem ação', (tester) async {
      await tester.pumpWidget(
        _emApp(const EstadoVazio(titulo: 'Nada aqui')),
      );

      expect(find.byType(FilledButton), findsNothing);
    });

    // Erro de rede sem caminho de recuperação deixa o usuário preso numa
    // tela vazia — no celular, é o caso comum, não a exceção.
    testWidgets('erro mostra a mensagem e oferece nova tentativa', (
      tester,
    ) async {
      var tentativas = 0;
      await tester.pumpWidget(
        _emApp(
          EstadoErro(
            mensagem: 'Sem conexão com o servidor.',
            aoTentarDeNovo: () => tentativas++,
          ),
        ),
      );

      expect(find.text('Sem conexão com o servidor.'), findsOneWidget);

      await tester.tap(find.text('Tentar de novo'));
      expect(tentativas, 1);
    });

    testWidgets('erro sem nova tentativa não mostra o botão', (tester) async {
      await tester.pumpWidget(_emApp(const EstadoErro(mensagem: 'Falhou.')));

      expect(find.text('Tentar de novo'), findsNothing);
    });
  });

  group('Cartao', () {
    testWidgets('projeta o conteúdo', (tester) async {
      await tester.pumpWidget(_emApp(const Cartao(child: Text('dentro'))));

      expect(find.text('dentro'), findsOneWidget);
    });

    testWidgets('é tocável quando recebe ação', (tester) async {
      var cliques = 0;
      await tester.pumpWidget(
        _emApp(Cartao(aoTocar: () => cliques++, child: const Text('x'))),
      );

      await tester.tap(find.text('x'));
      expect(cliques, 1);
    });
  });

  // Nunca diálogo nativo do sistema: a confirmação é componente do app, com
  // o mesmo cuidado de foco e fechamento adotado na web.
  group('ConfirmarDialog', () {
    Future<bool?> abrir(WidgetTester tester) async {
      late Future<bool?> resposta;

      await tester.pumpWidget(
        MaterialApp(
          theme: DinDinTheme.claro,
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () {
                  resposta = ConfirmarDialog.mostrar(
                    context,
                    titulo: 'Excluir carteira',
                    mensagem: 'Esta ação não pode ser desfeita.',
                    rotuloConfirmar: 'Excluir',
                  );
                },
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();
      return resposta;
    }

    testWidgets('mostra título e mensagem', (tester) async {
      await abrir(tester);

      expect(find.text('Excluir carteira'), findsOneWidget);
      expect(find.text('Esta ação não pode ser desfeita.'), findsOneWidget);
    });

    testWidgets('confirmar devolve true', (tester) async {
      final resposta = await abrir(tester);

      await tester.tap(find.text('Excluir'));
      await tester.pumpAndSettle();

      expect(await resposta, isTrue);
    });

    testWidgets('cancelar devolve false', (tester) async {
      final resposta = await abrir(tester);

      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(await resposta, isFalse);
    });

    // A ação destrutiva não pode parecer a opção padrão: quem toca no
    // primeiro botão que vê não deve apagar dado financeiro sem querer.
    testWidgets('o botão destrutivo usa a cor de perigo', (tester) async {
      await abrir(tester);

      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Excluir'),
      );
      final estilo = botao.style!.backgroundColor!.resolve({});

      expect(estilo, DinDinTheme.claro.extension<DinDinTokens>()!.danger);
    });
  });
}
