import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_screen.dart';

// ---------------------------------------------------------------------------
// Liberação do recurso de assinante na simulação (issue #442).
//
// Quem já assina pela web precisa encontrar a simulação por ativo liberada no
// app. Quem não assina continua vendo o ponto de entrada marcado, porque
// escondê-lo faria o assinante não descobrir que o recurso existe.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late List<String> caminhos;
  late CacheLocal cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = await CacheLocal.abrir();
  });

  DinDinApi apiFalsa() {
    caminhos = [];
    return DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient((req) async {
          caminhos.add('${req.method} ${req.url.path}');
          if (req.url.path == '/api/simulations/wallets') {
            return http.Response(
              jsonEncode([
                {
                  'slug': 'bb-fii',
                  'label': 'BB FIIs',
                  'provider': 'BB',
                  'months': ['2026-09'],
                },
              ]),
              200,
            );
          }
          return http.Response('{}', 200);
        }),
      ),
    );
  }

  Widget tela(AssinaturaService assinatura) => MaterialApp(
    theme: DinDinTheme.claro,
    // A tela vive dentro de um Scaffold no app; sem ele os campos de texto
    // não encontram o Material ancestral e o build falha.
    home: Scaffold(
      body: SimulacaoScreen(
        api: apiFalsa(),
        carteiras: const [],
        cache: cache,
        assinatura: assinatura,
      ),
    ),
  );

  // O selo fica abaixo do formulário, fora da primeira tela do celular: sem
  // rolar, o widget nem chega a ser construído pela lista.
  Future<void> rolarAteOFim(WidgetTester tester) async {
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
  }

  testWidgets('sem assinatura, a simulação por ativo segue marcada', (
    tester,
  ) async {
    final assinatura = AssinaturaService(apiFalsa());

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();
    await rolarAteOFim(tester);

    expect(
      find.byKey(const Key('selo-simulacao-ativo'), skipOffstage: false),
      findsOneWidget,
    );
  });

  testWidgets('com assinatura, o recurso deixa de ser marcado como pago', (
    tester,
  ) async {
    final assinatura = _AssinaturaLiberada();

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();
    await rolarAteOFim(tester);

    expect(
      find.byKey(const Key('selo-simulacao-ativo'), skipOffstage: false),
      findsNothing,
    );
  });
}

class _AssinaturaLiberada extends AssinaturaService {
  _AssinaturaLiberada()
    : super(
        DinDinApi(
          ApiClient(
            baseUrl: 'https://api.exemplo',
            tokenProvider: _ComToken(),
            httpClient: MockClient((_) async => http.Response('{}', 500)),
          ),
        ),
      );

  @override
  bool get temProjecoes => true;
}
