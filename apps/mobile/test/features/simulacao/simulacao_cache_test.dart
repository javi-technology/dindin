import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_form.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_screen.dart';

// ---------------------------------------------------------------------------
// Cache nas consultas da simulação (issue #404).
//
// As demais telas passam por `Recurso`/`CacheLocal`: mostram o último estado
// conhecido enquanto buscam o atual, sinalizam quando o dado é do cache e não
// se apagam na falha de rede. A simulação carregava à mão e ficava de fora
// dessas três garantias — no elevador ou no metrô, a tela vinha vazia.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late CacheLocal cache;

  final carteiraSalva = {
    'slug': 'bb-fii',
    'label': 'BB FIIs',
    'provider': 'BB',
    'months': ['2026-09'],
  };

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = await CacheLocal.abrir();
  });

  DinDinApi apiQueFalha() => DinDinApi(
    ApiClient(
      baseUrl: 'https://api.exemplo',
      tokenProvider: _ComToken(),
      httpClient: MockClient(
        (_) async => http.Response('{"error":"sem rede"}', 500),
      ),
    ),
  );

  Widget tela(DinDinApi api) => MaterialApp(
    theme: DinDinTheme.claro,
    home: Scaffold(
      body: SimulacaoScreen(api: api, carteiras: const [], cache: cache),
    ),
  );

  testWidgets('mostra a carteira do cache quando a rede falha', (tester) async {
    await cache.gravar('simulacao-carteiras', [carteiraSalva]);

    await tester.pumpWidget(tela(apiQueFalha()));
    await tester.pumpAndSettle();

    // O conteúdo continua em tela: com cache em mãos, a falha vira aviso e
    // não apaga o que o usuário já via. O formulário só monta com a lista de
    // carteiras em mãos, então encontrá-lo prova que ela veio do cache.
    expect(find.byType(SimulacaoForm), findsOneWidget);
  });

  testWidgets('guarda as carteiras buscadas para a próxima abertura', (
    tester,
  ) async {
    final api = DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient(
          (_) async => http.Response(jsonEncode([carteiraSalva]), 200),
        ),
      ),
    );

    await tester.pumpWidget(tela(api));
    await tester.pumpAndSettle();

    expect(cache.ler('simulacao-carteiras'), isNotNull);
  });
}
