import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/simulacao/sugestoes_view.dart';

// ---------------------------------------------------------------------------
// Sugestões da IA no app (issue #446).
//
// A #404 trouxe a comparação com a carteira sugerida, e parou aí: o usuário
// via o quanto está fora do peso recomendado e não recebia o que fazer a
// respeito. Na web é onde a comparação vira decisão de compra.
//
// O recurso exige o entitlement `ai`, e não o `projections` da simulação por
// ativo: são concessões diferentes na mesma assinatura.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

AiSuggestionItem item(String ticker, String acao, {double? valor}) =>
    AiSuggestionItem(
      ticker: ticker,
      action: acao,
      priority: 1,
      rationale: 'Abaixo do peso recomendado.',
      suggestedAmount: valor,
    );

AiSuggestion sugestao({List<AiSuggestionItem>? itens}) => AiSuggestion(
  id: 's1',
  walletId: 'w1',
  month: '2026-09',
  tab: AiSuggestionTab.renda,
  model: 'modelo-x',
  summary: 'Aportar nos dois ativos mais distantes do peso.',
  items: itens ?? [item('HGLG11', 'buy', valor: 1500)],
  disclaimer: 'Não é recomendação de investimento.',
  createdAt: '2026-09-20T10:00:00Z',
);

void main() {
  Widget emApp(Widget filho) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(body: filho),
  );

  group('SugestoesView', () {
    testWidgets('mostra o resumo, os itens e a premissa', (tester) async {
      await tester.pumpWidget(
        emApp(
          SugestoesView(
            sugestao: sugestao(),
            temAcesso: true,
            carregando: false,
            aoGerar: () {},
          ),
        ),
      );

      expect(find.textContaining('Aportar nos dois ativos'), findsOneWidget);
      expect(find.text('HGLG11'), findsOneWidget);
      expect(find.textContaining('1.500'), findsOneWidget);
      // O aviso de que não é recomendação acompanha o conteúdo, como na web.
      expect(
        find.textContaining('Não é recomendação de investimento'),
        findsOneWidget,
      );
    });

    // Esconder o ponto de entrada faria o assinante não descobrir que o
    // recurso existe — a mesma razão do selo na simulação por ativo.
    testWidgets('sem acesso, marca o recurso como de assinante', (
      tester,
    ) async {
      await tester.pumpWidget(
        emApp(
          SugestoesView(
            sugestao: null,
            temAcesso: false,
            carregando: false,
            aoGerar: () {},
          ),
        ),
      );

      expect(find.byKey(const Key('selo-sugestoes')), findsOneWidget);
      expect(find.byKey(const Key('gerar-sugestao')), findsNothing);
    });

    testWidgets('com acesso e sem sugestão, oferece gerar', (tester) async {
      var pedidos = 0;
      await tester.pumpWidget(
        emApp(
          SugestoesView(
            sugestao: null,
            temAcesso: true,
            carregando: false,
            aoGerar: () => pedidos += 1,
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('gerar-sugestao')));
      await tester.pumpAndSettle();

      expect(pedidos, 1);
    });

    testWidgets('não deixa pedir duas vezes enquanto gera', (tester) async {
      await tester.pumpWidget(
        emApp(
          SugestoesView(
            sugestao: null,
            temAcesso: true,
            carregando: true,
            aoGerar: () {},
          ),
        ),
      );

      final botao = tester.widget<FilledButton>(
        find.byKey(const Key('gerar-sugestao')),
      );
      expect(botao.onPressed, isNull);
    });

    // A falha vira aviso e não apaga o que já estava em tela: gerar de novo
    // custa uma chamada à IA.
    testWidgets('mostra o erro sem apagar a sugestão anterior', (tester) async {
      await tester.pumpWidget(
        emApp(
          SugestoesView(
            sugestao: sugestao(),
            temAcesso: true,
            carregando: false,
            erro: 'Não foi possível gerar a sugestão.',
            aoGerar: () {},
          ),
        ),
      );

      expect(find.textContaining('Não foi possível gerar'), findsOneWidget);
      expect(find.text('HGLG11'), findsOneWidget);
    });
  });

  group('DinDinApi', () {
    late List<String> pedidos;

    DinDinApi apiFalsa({List<Map<String, dynamic>>? lista}) {
      pedidos = [];
      return DinDinApi(
        ApiClient(
          baseUrl: 'https://api.exemplo',
          tokenProvider: _ComToken(),
          httpClient: MockClient((req) async {
            pedidos.add('${req.method} ${req.url.path}?${req.url.query}');
            final corpo = req.method == 'GET'
                ? lista ?? [sugestao().toJson()]
                : sugestao().toJson();
            return http.Response(jsonEncode(corpo), 200);
          }),
        ),
      );
    }

    test('lê a última sugestão da carteira', () async {
      final api = apiFalsa();

      final ultima = await api.sugestao('w1');

      expect(
        pedidos.single,
        'GET /api/recommended-wallets/bb-fii/suggestions?walletId=w1',
      );
      expect(ultima?.id, 's1');
    });

    test('devolve nulo quando ainda não há sugestão', () async {
      final api = apiFalsa(lista: []);

      expect(await api.sugestao('w1'), isNull);
    });

    test('gera uma sugestão nova', () async {
      final api = apiFalsa();

      final nova = await api.gerarSugestao();

      expect(
        pedidos.single,
        'POST /api/recommended-wallets/bb-fii/suggestions?',
      );
      expect(nova.id, 's1');
    });
  });
}
