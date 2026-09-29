import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
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

  // -------------------------------------------------------------------------
  // Contrato real da API (achado P1 do review)
  //
  // A primeira versão destes testes inventou a resposta no mock — lista, sem
  // `month`, sem 404 — e por isso passava enquanto o app falhava contra a API
  // de verdade. O controller exige `walletId` **e** `month` no GET, devolve um
  // objeto único, responde 404 quando não há sugestão, e o POST espera
  // `walletId`, `month` e `tab` no corpo.
  // -------------------------------------------------------------------------
  group('DinDinApi', () {
    late List<(String, String, Object?)> pedidos;

    DinDinApi apiFalsa({int status = 200}) {
      pedidos = [];
      return DinDinApi(
        ApiClient(
          baseUrl: 'https://api.exemplo',
          tokenProvider: _ComToken(),
          httpClient: MockClient((req) async {
            pedidos.add((
              '${req.method} ${req.url.path}',
              req.url.query,
              req.body.isEmpty ? null : jsonDecode(req.body),
            ));
            if (status != 200) {
              return http.Response(
                '{"error":"Sugestão não encontrada"}',
                status,
              );
            }
            return http.Response(jsonEncode(sugestao().toJson()), 200);
          }),
        ),
      );
    }

    test('consulta com walletId, month e tab', () async {
      final api = apiFalsa();

      final ultima = await api.sugestao(
        carteiraId: 'w1',
        mes: '2026-09',
        aba: AiSuggestionTab.renda,
      );

      final (rota, query, _) = pedidos.single;
      expect(rota, 'GET /api/recommended-wallets/bb-fii/suggestions');
      expect(query, contains('walletId=w1'));
      expect(query, contains('month=2026-09'));
      expect(query, contains('tab=renda'));
      expect(ultima?.id, 's1');
    });

    // 404 é o estado normal de quem ainda não gerou nenhuma, e não um erro
    // para mostrar na tela.
    test('devolve nulo no 404', () async {
      final api = apiFalsa(status: 404);

      final ultima = await api.sugestao(
        carteiraId: 'w1',
        mes: '2026-09',
        aba: AiSuggestionTab.renda,
      );

      expect(ultima, isNull);
    });

    test('propaga os demais erros', () async {
      final api = apiFalsa(status: 500);

      expect(
        () => api.sugestao(
          carteiraId: 'w1',
          mes: '2026-09',
          aba: AiSuggestionTab.renda,
        ),
        throwsA(isA<ApiException>()),
      );
    });

    test('gera enviando walletId, month e tab no corpo', () async {
      final api = apiFalsa();

      final nova = await api.gerarSugestao(
        carteiraId: 'w1',
        mes: '2026-09',
        aba: AiSuggestionTab.ganho,
      );

      final (rota, _, corpo) = pedidos.single;
      expect(rota, 'POST /api/recommended-wallets/bb-fii/suggestions');
      expect(corpo, {'walletId': 'w1', 'month': '2026-09', 'tab': 'ganho'});
      expect(nova.id, 's1');
    });
  });
}
