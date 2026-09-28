import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/carteiras/carteira_form.dart';
import 'package:dindin_mobile/features/carteiras/posicao_form.dart';
import 'package:dindin_mobile/features/proventos/provento_form.dart';

// ---------------------------------------------------------------------------
// Formulários de escrita (issue #403).
//
// Registrar posição no celular é o momento em que o usuário está longe do
// computador, logo após operar pelo home broker: o formulário precisa validar
// antes de enviar, aceitar vírgula decimal e não perder o que foi digitado
// quando a rede cai.
// ---------------------------------------------------------------------------
void main() {
  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: filho),
  );

  Future<void> digitar(WidgetTester tester, String chave, String texto) =>
      tester.enterText(find.byKey(Key(chave)), texto);

  group('carteira', () {
    testWidgets('envia o nome e a moeda', (tester) async {
      CreateWalletRequest? enviado;
      await tester.pumpWidget(
        emApp(
          CarteiraForm(
            aoSalvar: (dados) async {
              enviado = dados;
              return true;
            },
          ),
        ),
      );

      await digitar(tester, 'campo-nome', 'Principal');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviado?.name, 'Principal');
      expect(enviado?.currency, 'BRL');
    });

    testWidgets('não envia sem nome', (tester) async {
      var enviou = false;
      await tester.pumpWidget(
        emApp(
          CarteiraForm(
            aoSalvar: (_) async {
              enviou = true;
              return true;
            },
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviou, isFalse);
      expect(find.text('Informe o nome.'), findsOneWidget);
    });

    testWidgets('na edição, começa com os dados atuais', (tester) async {
      await tester.pumpWidget(
        emApp(
          CarteiraForm(
            nomeInicial: 'Antiga',
            descricaoInicial: 'minha carteira',
            aoSalvar: (_) async => true,
          ),
        ),
      );

      expect(find.text('Antiga'), findsOneWidget);
      expect(find.text('minha carteira'), findsOneWidget);
    });
  });

  group('posição', () {
    Future<void> montarPosicao(
      WidgetTester tester, {
      required Future<bool> Function(CreatePositionRequest) aoSalvar,
    }) => tester.pumpWidget(emApp(PosicaoForm(aoSalvar: aoSalvar)));

    testWidgets('aceita quantidade e preço com vírgula decimal', (
      tester,
    ) async {
      CreatePositionRequest? enviado;
      await montarPosicao(
        tester,
        aoSalvar: (dados) async {
          enviado = dados;
          return true;
        },
      );

      await digitar(tester, 'campo-ticker', 'hglg11');
      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-preco', '105,55');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviado?.averagePrice, 105.55);
      expect(enviado?.quantity, 10);
    });

    // O ticker é o identificador do ativo na API, que o trata em maiúsculas;
    // exigir isso do usuário no teclado do celular é pedir erro de digitação.
    testWidgets('normaliza o ticker para maiúsculas', (tester) async {
      CreatePositionRequest? enviado;
      await montarPosicao(
        tester,
        aoSalvar: (dados) async {
          enviado = dados;
          return true;
        },
      );

      await digitar(tester, 'campo-ticker', ' hglg11 ');
      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-preco', '100');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviado?.ticker, 'HGLG11');
    });

    testWidgets('não envia sem ticker', (tester) async {
      var enviou = false;
      await montarPosicao(
        tester,
        aoSalvar: (_) async {
          enviou = true;
          return true;
        },
      );

      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-preco', '100');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviou, isFalse);
      expect(find.text('Informe o ticker.'), findsOneWidget);
    });

    testWidgets('não envia com quantidade zero', (tester) async {
      var enviou = false;
      await montarPosicao(
        tester,
        aoSalvar: (_) async {
          enviou = true;
          return true;
        },
      );

      await digitar(tester, 'campo-ticker', 'HGLG11');
      await digitar(tester, 'campo-quantidade', '0');
      await digitar(tester, 'campo-preco', '100');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviou, isFalse);
      expect(
        find.text('A quantidade precisa ser maior que zero.'),
        findsOneWidget,
      );
    });

    testWidgets('não envia com preço inválido', (tester) async {
      var enviou = false;
      await montarPosicao(
        tester,
        aoSalvar: (_) async {
          enviou = true;
          return true;
        },
      );

      await digitar(tester, 'campo-ticker', 'HGLG11');
      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-preco', '');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviou, isFalse);
    });

    group('envio', () {
      testWidgets('o botão fica indisponível durante o envio', (tester) async {
        final resposta = Completer<bool>();
        await montarPosicao(tester, aoSalvar: (_) => resposta.future);

        await digitar(tester, 'campo-ticker', 'HGLG11');
        await digitar(tester, 'campo-quantidade', '10');
        await digitar(tester, 'campo-preco', '100');
        await tester.tap(find.byKey(const Key('botao-salvar')));
        await tester.pump();

        final botao = tester.widget<FilledButton>(
          find.byKey(const Key('botao-salvar')),
        );
        expect(botao.onPressed, isNull);

        resposta.complete(true);
        await tester.pumpAndSettle();
      });

      testWidgets('toque duplo não gera dois registros', (tester) async {
        final resposta = Completer<bool>();
        var envios = 0;
        await montarPosicao(
          tester,
          aoSalvar: (_) {
            envios++;
            return resposta.future;
          },
        );

        await digitar(tester, 'campo-ticker', 'HGLG11');
        await digitar(tester, 'campo-quantidade', '10');
        await digitar(tester, 'campo-preco', '100');
        await tester.tap(find.byKey(const Key('botao-salvar')));
        await tester.pump();
        await tester.tap(
          find.byKey(const Key('botao-salvar')),
          warnIfMissed: false,
        );
        await tester.pump();

        expect(envios, 1);

        resposta.complete(true);
        await tester.pumpAndSettle();
      });

      // Refazer o preenchimento no teclado do celular depois de uma falha de
      // rede é onde o usuário desiste.
      testWidgets('falha preserva o que foi preenchido', (tester) async {
        await montarPosicao(tester, aoSalvar: (_) async => false);

        await digitar(tester, 'campo-ticker', 'HGLG11');
        await digitar(tester, 'campo-quantidade', '10');
        await digitar(tester, 'campo-preco', '105,55');
        await tester.tap(find.byKey(const Key('botao-salvar')));
        await tester.pumpAndSettle();

        expect(find.text('HGLG11'), findsOneWidget);
        expect(find.text('105,55'), findsOneWidget);
      });

      testWidgets('erro informado aparece na tela', (tester) async {
        await tester.pumpWidget(
          emApp(
            PosicaoForm(
              aoSalvar: (_) async => false,
              erro: 'Sem conexão com o servidor. Tente de novo.',
            ),
          ),
        );

        expect(
          find.text('Sem conexão com o servidor. Tente de novo.'),
          findsOneWidget,
        );
      });
    });
  });

  group('provento', () {
    testWidgets('envia ticker, valor por cota, quantidade e data', (
      tester,
    ) async {
      DividendCreateRequest? enviado;
      await tester.pumpWidget(
        emApp(
          ProventoForm(
            aoSalvar: (dados) async {
              enviado = dados;
              return true;
            },
          ),
        ),
      );

      await digitar(tester, 'campo-ticker', 'HGLG11');
      await digitar(tester, 'campo-valor-por-cota', '1,10');
      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-data', '15/09/2026');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviado?.amountPerShare, 1.1);
      // A API recebe `YYYY-MM-DD`; a tela mostra o padrão brasileiro.
      expect(enviado?.paymentDate, '2026-09-15');
    });

    testWidgets('não envia com data inválida', (tester) async {
      var enviou = false;
      await tester.pumpWidget(
        emApp(
          ProventoForm(
            aoSalvar: (_) async {
              enviou = true;
              return true;
            },
          ),
        ),
      );

      await digitar(tester, 'campo-ticker', 'HGLG11');
      await digitar(tester, 'campo-valor-por-cota', '1,10');
      await digitar(tester, 'campo-quantidade', '10');
      await digitar(tester, 'campo-data', '32/13/2026');
      await tester.tap(find.byKey(const Key('botao-salvar')));
      await tester.pumpAndSettle();

      expect(enviou, isFalse);
      expect(find.text('Data inválida.'), findsOneWidget);
    });
  });
}
