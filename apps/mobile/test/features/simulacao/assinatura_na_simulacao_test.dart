import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/assinatura/loja_backend.dart';
import 'package:dindin_mobile/core/assinatura/loja_service.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/theme/dindin_theme.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_form.dart';
import 'package:dindin_mobile/features/simulacao/simulacao_screen.dart';

import '../../support/assinatura_controlada.dart';
import '../../support/cache_de_teste.dart';

// ---------------------------------------------------------------------------
// Simulação como recurso de assinante (issues #442 e #573).
//
// A simulação inteira é de assinante. Quem já assina pela web a encontra
// liberada no app; quem não assina vê o paywall no lugar dela, com o caminho
// para assinar, e não um erro da API.
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
    cache = await cacheDeTeste();
  });

  DinDinApi apiFalsa() {
    caminhos = [];
    return DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient((req) async {
          caminhos.add('${req.method} ${req.url.path}');
          if (req.url.path == '/api/simulations/wallet') {
            return http.Response(
              jsonEncode({
                'error': 'Acesso negado',
                'code': 'SUBSCRIPTION_REQUIRED',
              }),
              403,
            );
          }
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

  testWidgets('sem assinatura, mostra o paywall no lugar da simulação', (
    tester,
  ) async {
    final assinatura = AssinaturaService(apiFalsa());
    await assinatura.carregar();

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('paywall-simulacao')), findsOneWidget);
    expect(find.byType(SimulacaoForm), findsNothing);
    // A API recusa a lista a quem não assina: pedi-la só traria um erro para
    // a tela onde deve estar o paywall.
    expect(caminhos, isNot(contains('GET /api/simulations/wallets')));
  });

  // Issue #405: o paywall leva à compra in-app.
  testWidgets('sem assinatura e com loja, "Ver planos" abre a compra', (
    tester,
  ) async {
    final loja = LojaService(
      backend: _LojaMinima(),
      registrar: (_) async {},
      recarregar: () async {},
    );
    await loja.iniciar();
    final assinatura = AssinaturaService(apiFalsa(), loja: loja);

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ver-planos')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('assinar-dindin_basic_monthly')),
      findsOneWidget,
    );
    loja.dispose();
  });

  testWidgets('sem a compra in-app configurada, não há "Ver planos"', (
    tester,
  ) async {
    await tester.pumpWidget(tela(AssinaturaService(apiFalsa())));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('paywall-simulacao')), findsOneWidget);
    expect(find.byKey(const Key('ver-planos')), findsNothing);
  });

  testWidgets('com assinatura, a simulação fica liberada', (tester) async {
    await tester.pumpWidget(tela(AssinaturaControlada()));
    await tester.pumpAndSettle();

    expect(find.byType(SimulacaoForm), findsOneWidget);
    expect(find.byKey(const Key('paywall-simulacao')), findsNothing);
  });

  // A assinatura comprada dentro do app chega depois de a tela abrir.
  testWidgets('a assinatura reconhecida depois libera a simulação', (
    tester,
  ) async {
    final assinatura = AssinaturaControlada(liberada: false);

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();
    assinatura.liberar();
    await tester.pumpAndSettle();

    expect(find.byType(SimulacaoForm), findsOneWidget);
    expect(caminhos, contains('GET /api/simulations/wallets'));
  });

  // Assinatura que venceu no meio da sessão: a API recusa, e a tela volta ao
  // paywall em vez de mostrar "Acesso negado".
  testWidgets('simulação recusada por falta de assinatura volta ao paywall', (
    tester,
  ) async {
    final assinatura = AssinaturaControlada(aoRecarregar: () => false);

    await tester.pumpWidget(tela(assinatura));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-valor')), '1000');
    await tester.tap(find.byKey(const Key('botao-simular')));
    await tester.pumpAndSettle();

    expect(assinatura.recargas, 1);
    expect(find.byKey(const Key('paywall-simulacao')), findsOneWidget);
    expect(find.text('Acesso negado'), findsNothing);
  });
}

class _LojaMinima implements LojaBackend {
  @override
  String get plataforma => 'apple';
  @override
  Future<bool> disponivel() async => true;
  @override
  Future<List<ProdutoDaLoja>> produtos() async => const [
    ProdutoDaLoja(
      id: 'dindin_basic_monthly',
      titulo: 'Mensal',
      preco: 'R\$ 19,90',
    ),
  ];
  @override
  Stream<CompraDaLoja> get compras => const Stream.empty();
  @override
  Future<void> comprar(String produtoId) async {}
  @override
  Future<void> restaurar() async {}
}
