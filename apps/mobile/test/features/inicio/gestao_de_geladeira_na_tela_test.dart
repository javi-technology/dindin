import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/auth/auth_service.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/notificacoes/notificacoes_service.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/core/theme/theme_controller.dart';
import 'package:dindin_mobile/features/inicio/inicio_screen.dart';

import '../../core/auth/auth_backend_falso.dart';
import '../../core/notificacoes/notificacoes_backend_falso.dart';
import '../../support/cache_de_teste.dart';

// ---------------------------------------------------------------------------
// Achados do review da #449, na tela onde eles acontecem.
//
// A tela inicial não tinha teste nenhum, e é por isso que três defeitos de
// integração passaram: o ativo ia para a geladeira errada depois de trocar, o
// cabeçalho não acompanhava o renome, e excluir a última geladeira deixava o
// app sem forma de criar outra.
// ---------------------------------------------------------------------------

Map<String, dynamic> geladeira(String id, String nome) => {
  'id': id,
  'ownerId': 'u1',
  'name': nome,
  'createdAt': '2026-09-01T00:00:00Z',
  'updatedAt': '2026-09-01T00:00:00Z',
};

void main() {
  late List<(String, String, Object?)> enviadas;
  late List<Map<String, dynamic>> geladeirasDaApi;
  late List<Map<String, dynamic>> historicoDaApi;
  Completer<void>? historicoPendente;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    enviadas = [];
    geladeirasDaApi = [geladeira('g1', 'Primeira'), geladeira('g2', 'Segunda')];
    historicoDaApi = [];
    historicoPendente = null;
  });

  DinDinApi apiFalsa() => DinDinApi(
    ApiClient(
      baseUrl: 'https://api.exemplo',
      tokenProvider: AuthService(AuthBackendFalso()),
      httpClient: MockClient((req) async {
        enviadas.add((
          req.method,
          req.url.path,
          req.body.isEmpty ? null : jsonDecode(req.body),
        ));

        if (req.url.path == '/api/dashboard/summary') {
          return http.Response(
            jsonEncode({
              'totalWallet': 1000.0,
              'totalFridge': 0.0,
              'total': 1000.0,
              'monthlyIncomeTotal': 8.0,
              'composition': [
                {'ticker': 'HGLG11', 'value': 1000.0},
              ],
            }),
            200,
          );
        }
        if (req.url.path == '/api/fridges' && req.method == 'GET') {
          return http.Response(jsonEncode(geladeirasDaApi), 200);
        }
        if (req.url.path == '/api/patrimony/history') {
          // A resposta pode ficar pendente, para o teste controlar quando o
          // histórico chega — que é o caso do defeito.
          await historicoPendente?.future;
          return http.Response(jsonEncode(historicoDaApi), 200);
        }
        if (req.url.path.endsWith('/items') && req.method == 'GET') {
          return http.Response('[]', 200);
        }
        if (req.method == 'PUT' || req.method == 'POST') {
          return http.Response(jsonEncode(geladeira('g1', 'Renomeada')), 200);
        }
        if (req.method == 'DELETE') return http.Response('', 204);
        return http.Response('[]', 200);
      }),
    ),
  );

  Future<void> abrirTela(WidgetTester tester) async {
    final api = apiFalsa();
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: InicioScreen(
          auth: AuthService(AuthBackendFalso()),
          api: api,
          cache: await cacheDeTeste(),
          tema: await ThemeController.carregar(),
          notificacoes: await NotificacoesService.carregar(
            backend: NotificacoesBackendFalso(),
            registrarToken: (_, _) async {},
            removerToken: (_) async {},
          ),
          assinatura: AssinaturaService(api),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> abrirGeladeira(WidgetTester tester) async {
    final api = apiFalsa();
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: InicioScreen(
          auth: AuthService(AuthBackendFalso()),
          api: api,
          cache: await cacheDeTeste(),
          tema: await ThemeController.carregar(),
          notificacoes: await NotificacoesService.carregar(
            backend: NotificacoesBackendFalso(),
            registrarToken: (_, _) async {},
            removerToken: (_) async {},
          ),
          assinatura: AssinaturaService(api),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // A geladeira é a terceira aba.
    await tester.tap(find.text('Geladeira'));
    await tester.pumpAndSettle();
  }

  testWidgets('cria o ativo na geladeira aberta, não na primeira', (
    tester,
  ) async {
    await abrirGeladeira(tester);

    await tester.tap(find.byKey(const Key('trocar-geladeira')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Segunda').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('criar-item')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-ticker')), 'HGLG11');
    await tester.enterText(find.byKey(const Key('campo-quantidade')), '10');
    await tester.enterText(
      find.byKey(const Key('campo-preco-transferencia')),
      '150,00',
    );
    await tester.enterText(find.byKey(const Key('campo-preco-alvo')), '160,00');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    final criacoes = enviadas.where(
      (e) => e.$1 == 'POST' && e.$2.endsWith('/items'),
    );
    expect(criacoes.single.$2, '/api/fridges/g2/items');
  });

  testWidgets('renomear atualiza o cabeçalho', (tester) async {
    await abrirGeladeira(tester);
    expect(find.text('Primeira'), findsOneWidget);

    geladeirasDaApi = [
      geladeira('g1', 'Renomeada'),
      geladeira('g2', 'Segunda'),
    ];

    await tester.tap(find.byKey(const Key('acoes-geladeira')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Renomear'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-nome')), 'Renomeada');
    await tester.tap(find.byKey(const Key('botao-salvar')));
    await tester.pumpAndSettle();

    expect(find.text('Renomeada'), findsOneWidget);
  });

  // O histórico chega depois do resumo, e a tela precisa redesenhar: o
  // `Recurso` avisa quem o escuta, e ninguém escutava (#454).
  testWidgets('mostra o gráfico quando o histórico chega depois', (
    tester,
  ) async {
    historicoPendente = Completer<void>();
    historicoDaApi = [
      for (final total in [100.0, 200.0])
        {
          'id': '$total',
          'userId': 'u1',
          'date': '2026-08-01',
          'totalWallet': total,
          'totalFridge': 0.0,
          'total': total,
          'createdAt': '2026-08-01T00:00:00Z',
        },
    ];

    await abrirTela(tester);
    // Enquanto o histórico não chega, o gráfico diz o que falta.
    expect(find.byKey(const Key('grafico-patrimonio-vazio')), findsOneWidget);

    historicoPendente!.complete();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('grafico-patrimonio-vazio')), findsNothing);
  });

  // Sem geladeira nenhuma, o botão de "novo ativo" só sabe avisar que falta
  // uma geladeira — e não havia por onde criá-la.
  testWidgets('sem geladeira, o botão oferece criar uma', (tester) async {
    geladeirasDaApi = [];

    await abrirGeladeira(tester);

    expect(find.byKey(const Key('criar-geladeira')), findsOneWidget);
  });
}
