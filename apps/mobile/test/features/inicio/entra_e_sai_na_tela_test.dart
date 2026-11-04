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
// O quadro "Entra e sai do mês" fica fora do paywall (issue #586): o atalho
// está na aba Geladeira, e não na Simulação, restrita a assinantes (#573).
// ---------------------------------------------------------------------------

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Map<String, dynamic> carimbo() => {
    'createdAt': '2026-09-01T00:00:00Z',
    'updatedAt': '2026-09-01T00:00:00Z',
  };

  Future<List<String>> abrirAbaGeladeira(
    WidgetTester tester, {
    required List<Map<String, dynamic>> geladeiras,
  }) async {
    final pedidos = <String>[];
    final api = DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: AuthService(AuthBackendFalso()),
        httpClient: MockClient((req) async {
          pedidos.add(req.url.path);
          switch (req.url.path) {
            case '/api/billing/me':
              return http.Response('{"message":"sem assinatura"}', 403);
            case '/api/dashboard/summary':
              return http.Response(
                jsonEncode({
                  'totalWallet': 0.0,
                  'totalFridge': 0.0,
                  'total': 0.0,
                  'monthlyIncomeTotal': 0.0,
                  'composition': [],
                }),
                200,
              );
            case '/api/fridges':
              return http.Response(jsonEncode(geladeiras), 200);
            case '/api/recommended-wallets/bb-fii/latest':
              return http.Response(
                jsonEncode({
                  'id': 'bb-fii_2026-11',
                  'provider': 'BB',
                  'month': '2026-11',
                  'revision': 1,
                  'publishedAt': '2026-11-03',
                  'sourceFile': 'wallets/fii-bb/CartFII_Nov26.pdf',
                  'status': 'confirmed',
                  'renda': [],
                  'ganho': [],
                  'changes': {
                    'renda': {
                      'entering': ['KNCR11'],
                      'leaving': ['RZTR11'],
                    },
                  },
                  'parsedAt': '2026-11-03T00:00:00Z',
                  ...carimbo(),
                }),
                200,
              );
          }
          return http.Response('[]', 200);
        }),
      ),
    );

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
    await tester.tap(find.text('Geladeira').last);
    await tester.pumpAndSettle();
    return pedidos;
  }

  testWidgets('abre o quadro pela aba Geladeira, sem passar pelo paywall', (
    tester,
  ) async {
    await abrirAbaGeladeira(
      tester,
      geladeiras: [
        {'id': 'g1', 'ownerId': 'u1', 'name': 'Principal', ...carimbo()},
      ],
    );

    await tester.tap(find.byKey(const Key('abrir-entra-e-sai')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('saindo-RZTR11')), findsOneWidget);
    expect(find.byKey(const Key('entrando-KNCR11')), findsOneWidget);
    expect(find.byKey(const Key('paywall-simulacao')), findsNothing);
  });

  testWidgets('o atalho aparece também sem nenhuma geladeira', (tester) async {
    await abrirAbaGeladeira(tester, geladeiras: []);

    expect(find.byKey(const Key('abrir-entra-e-sai')), findsOneWidget);
  });
}
