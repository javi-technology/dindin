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

import '../../support/cache_de_teste.dart';

// ---------------------------------------------------------------------------
// Cobrança desligada (issue #594).
//
// O DinDin virou ferramenta gratuita: a API libera todos os entitlements e
// informa `billingEnabled: false`. O app não pode continuar chamando de
// "recurso de assinante" o que não tem mais assinatura.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

const _simulacao = {
  'amount': 1000,
  'months': 12,
  'mode': 'reinvest',
  'allocatedAmount': 960,
  'unallocatedAmount': 40,
  'monthlyIncome': 6.6,
  'totalIncome': 79.2,
  'reinvestedAmount': 70,
  'uninvestedIncome': 9.2,
  'byTicker': [
    {
      'ticker': 'HGLG11',
      'price': 160,
      'monthlyDividend': 1.1,
      'quantity': 6,
      'finalQuantity': 6,
      'investedAmount': 960,
      'monthlyIncome': 6.6,
      'totalIncome': 79.2,
    },
  ],
  'missingDividendTickers': <String>[],
  'staleDividendTickers': <String>[],
  'basis': {
    'source': 'monthlyDividend',
    'assumesRepetition': true,
    'staleAfterDays': 45,
  },
  'provider': {'slug': 'bb-fii', 'label': 'BB', 'provider': 'BB'},
  'walletMonth': '2026-09',
  'tab': 'renda',
};

void main() {
  late CacheLocal cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = await cacheDeTeste();
  });

  DinDinApi apiFalsa({bool? billingEnabled}) => DinDinApi(
    ApiClient(
      baseUrl: 'https://api.exemplo',
      tokenProvider: _ComToken(),
      httpClient: MockClient((req) async {
        switch (req.url.path) {
          case '/api/me':
            return http.Response(
              jsonEncode({
                'uid': 'u1',
                'admin': false,
                'subscription': {'status': 'none', 'cancelAtPeriodEnd': false},
                'entitlements': ['ai', 'projections'],
                'billingEnabled': ?billingEnabled,
              }),
              200,
            );
          case '/api/simulations/wallets':
            return http.Response(
              jsonEncode([
                {
                  'slug': 'bb-fii',
                  'label': 'BB',
                  'provider': 'BB',
                  'months': ['2026-09'],
                },
              ]),
              200,
            );
          case '/api/simulations/wallet':
            return http.Response(jsonEncode(_simulacao), 200);
        }
        return http.Response('{}', 404);
      }),
    ),
  );

  group('AssinaturaService', () {
    test('lê a cobrança desligada de /api/me', () async {
      final assinatura = AssinaturaService(apiFalsa(billingEnabled: false));

      await assinatura.carregar();

      expect(assinatura.cobrancaLigada, isFalse);
    });

    // A API anterior à #594 não manda o campo, e cobra.
    test('sem o campo, considera a cobrança ligada', () async {
      final assinatura = AssinaturaService(apiFalsa());

      expect(assinatura.cobrancaLigada, isTrue);
      await assinatura.carregar();
      expect(assinatura.cobrancaLigada, isTrue);
    });
  });

  Future<void> simular(
    WidgetTester tester,
    AssinaturaService assinatura,
  ) async {
    await assinatura.carregar();
    await tester.pumpWidget(
      MaterialApp(
        theme: DinDinTheme.claro,
        home: Scaffold(
          body: SimulacaoScreen(
            api: apiFalsa(),
            carteiras: const [],
            cache: cache,
            assinatura: assinatura,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('campo-valor')), '1000');
    await tester.tap(find.byKey(const Key('botao-simular')));
    await tester.pumpAndSettle();
  }

  testWidgets('não marca nada como recurso de assinante', (tester) async {
    await simular(tester, AssinaturaService(apiFalsa(billingEnabled: false)));

    expect(find.text('HGLG11'), findsWidgets);
    expect(find.byKey(const Key('selo-assinante')), findsNothing);
    expect(find.byKey(const Key('simular-ativo-HGLG11')), findsNothing);
  });

  testWidgets('com a cobrança ligada, mantém o ponto de entrada marcado', (
    tester,
  ) async {
    await simular(tester, AssinaturaService(apiFalsa(billingEnabled: true)));

    expect(find.byKey(const Key('simular-ativo-HGLG11')), findsOneWidget);
  });
}
