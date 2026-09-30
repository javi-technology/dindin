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
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/notificacoes/notificacoes_service.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/core/theme/theme_controller.dart';
import 'package:dindin_mobile/features/inicio/inicio_screen.dart';

import '../../core/auth/auth_backend_falso.dart';
import '../../core/notificacoes/notificacoes_backend_falso.dart';

// ---------------------------------------------------------------------------
// Catálogo que chega depois de o formulário abrir (review da #468).
//
// O modal recebia a lista no instante da abertura e só observava o envio: quem
// abria o formulário enquanto o catálogo carregava ficava no modo de texto
// livre até o envio, e o erro só voltava da API.
// ---------------------------------------------------------------------------

void main() {
  // Criado dentro do teste, e não no setUp: fora do corpo do `testWidgets` o
  // completer não obedece ao relógio do teste e a resposta nunca chega.
  late Completer<void> catalogoPendente;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DinDinApi apiFalsa() => DinDinApi(
    ApiClient(
      baseUrl: 'https://api.exemplo',
      tokenProvider: AuthService(AuthBackendFalso()),
      httpClient: MockClient((req) async {
        if (req.url.path == '/api/assets') {
          await catalogoPendente.future;
          return http.Response(
            jsonEncode([
              {
                'ticker': 'HGLG11',
                'name': 'CSHG Logística',
                'assetType': 'FII',
                'active': true,
                'createdAt': '2026-09-01T00:00:00Z',
                'updatedAt': '2026-09-01T00:00:00Z',
              },
            ]),
            200,
          );
        }
        if (req.url.path == '/api/fridges' && req.method == 'GET') {
          return http.Response(
            jsonEncode([
              {
                'id': 'g1',
                'ownerId': 'u1',
                'name': 'Primeira',
                'createdAt': '2026-09-01T00:00:00Z',
                'updatedAt': '2026-09-01T00:00:00Z',
              },
            ]),
            200,
          );
        }
        if (req.url.path == '/api/dashboard/summary') {
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
        }
        return http.Response('[]', 200);
      }),
    ),
  );

  testWidgets('a lista que chega com o formulário aberto passa a valer', (
    tester,
  ) async {
    catalogoPendente = Completer<void>();
    final api = apiFalsa();
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: InicioScreen(
          auth: AuthService(AuthBackendFalso()),
          api: api,
          cache: await CacheLocal.abrir(),
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
    await tester.tap(find.text('Geladeira'));
    await tester.pumpAndSettle();

    // Formulário aberto com o catálogo ainda a caminho.
    await tester.tap(find.byKey(const Key('criar-item')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-ticker')), 'ZZZZ11');
    await tester.pumpAndSettle();
    expect(find.text('Escolha um ativo da lista.'), findsNothing);

    // O catálogo chega: o campo passa a recusar o que não está nele.
    catalogoPendente.complete();
    await tester.pumpAndSettle();

    expect(find.text('Escolha um ativo da lista.'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('botao-salvar')))
          .onPressed,
      isNull,
    );
  });
}
