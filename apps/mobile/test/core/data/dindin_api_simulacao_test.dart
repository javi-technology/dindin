import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

// ---------------------------------------------------------------------------
// Carteira sugerida e simulação (issue #404).
//
// São o diferencial do produto, e ficariam de fora do app se a paridade
// parasse nas telas de carteira própria.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late List<(String, String, Object?)> enviadas;

  DinDinApi apiQue(Map<String, Object?> respostas, {int status = 200}) {
    enviadas = [];

    return DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient((req) async {
          enviadas.add((
            req.method,
            req.url.path,
            req.body.isEmpty ? null : jsonDecode(req.body),
          ));
          final corpo = respostas['${req.method} ${req.url.path}'];
          if (corpo == null) return http.Response('{"error":"nao"}', 404);
          return http.Response(jsonEncode(corpo), status);
        }),
      ),
    );
  }

  final simulacao = {
    'amount': 1000.0,
    'months': 12,
    'mode': 'reinvest',
    'allocatedAmount': 980.0,
    'unallocatedAmount': 20.0,
    'monthlyIncome': 8.5,
    'totalIncome': 102.0,
    'reinvestedAmount': 90.0,
    'uninvestedIncome': 12.0,
    'byTicker': [
      {
        'ticker': 'HGLG11',
        'price': 160.0,
        'monthlyDividend': 1.1,
        'quantity': 6,
        'finalQuantity': 6,
        'investedAmount': 960.0,
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

  test('lista as carteiras sugeridas disponíveis', () async {
    final api = apiQue({
      'GET /api/simulations/wallets': [
        {
          'slug': 'bb-fii',
          'label': 'BB',
          'provider': 'BB',
          'months': ['2026-09', '2026-08'],
        },
      ],
    });

    final opcoes = await api.carteirasParaSimular();

    expect(enviadas.single.$2, '/api/simulations/wallets');
    expect(opcoes.single.slug, 'bb-fii');
    expect(opcoes.single.months, ['2026-09', '2026-08']);
  });

  test('simula por carteira sugerida', () async {
    final api = apiQue({'POST /api/simulations/wallet': simulacao});

    final resultado = await api.simularCarteira(
      const WalletSimulationRequest(amount: 1000, months: 12),
    );

    expect(enviadas.single.$2, '/api/simulations/wallet');
    expect(resultado.unallocatedAmount, 20.0);
    expect(resultado.byTicker.single.ticker, 'HGLG11');
    expect(resultado.basis.staleAfterDays, 45);
  });

  // A API converte texto em pt-BR; mandar o que o usuário digitou evita o app
  // fazer a conversão duas vezes e discordar do servidor.
  test('envia o valor como o usuário digitou', () async {
    final api = apiQue({'POST /api/simulations/wallet': simulacao});

    await api.simularCarteira(
      const WalletSimulationRequest(amount: '1.500,55', months: 12),
    );

    expect((enviadas.single.$3 as Map)['amount'], '1.500,55');
  });

  test('busca a carteira sugerida mais recente', () async {
    final api = apiQue({
      'GET /api/recommended-wallets/bb-fii/latest': {
        'id': 'bb-fii_2026-09',
        'provider': 'BB',
        'month': '2026-09',
        'revision': 1,
        'publishedAt': '2026-09-01',
        'sourceFile': 'x.pdf',
        'status': 'confirmed',
        'renda': [
          {
            'ticker': 'HGLG11',
            'segment': 'Logística',
            'weight': 0.2,
            'closePrice': 160.0,
            'ifixWeight': 0.03,
            'inCatalog': true,
          },
        ],
        'ganho': <Object>[],
        'parsedAt': '2026-09-01T00:00:00Z',
        'createdAt': '2026-09-01T00:00:00Z',
        'updatedAt': '2026-09-01T00:00:00Z',
      },
    });

    final carteira = await api.carteiraSugerida();

    expect(carteira.month, '2026-09');
    expect(carteira.renda.single.ticker, 'HGLG11');
  });

  test('compara a carteira do usuário com a sugerida', () async {
    final api = apiQue({
      'GET /api/recommended-wallets/bb-fii/compare/w1': {
        'recommended': {
          'id': 'bb-fii_2026-09',
          'provider': 'BB',
          'month': '2026-09',
          'revision': 1,
          'publishedAt': '2026-09-01',
          'sourceFile': 'x.pdf',
          'status': 'confirmed',
          'renda': <Object>[],
          'ganho': <Object>[],
          'parsedAt': '2026-09-01T00:00:00Z',
          'createdAt': '2026-09-01T00:00:00Z',
          'updatedAt': '2026-09-01T00:00:00Z',
        },
        'items': [
          {
            'ticker': 'HGLG11',
            'recommendedWeight': 0.2,
            'currentWeight': 0.15,
            'quantity': 6,
            'currentValue': 960.0,
            'status': 'match',
          },
          {
            'ticker': 'XPLG11',
            'recommendedWeight': 0.1,
            'currentWeight': null,
            'quantity': 0,
            'currentValue': 0.0,
            'status': 'missing',
          },
        ],
        'totalValue': 960.0,
      },
    });

    final comparacao = await api.compararComSugerida('w1');

    expect(comparacao.items, hasLength(2));
    expect(comparacao.items.last.currentWeight, isNull);
  });

  // A simulação por ativo é recurso de assinante, e a API responde com o
  // código de contrato que o app precisa reconhecer para oferecer a
  // assinatura em vez de mostrar "erro".
  test(
    'simulação por ativo sem assinatura expõe o código de contrato',
    () async {
      final api = DinDinApi(
        ApiClient(
          baseUrl: 'https://api.exemplo',
          tokenProvider: _ComToken(),
          httpClient: MockClient(
            (req) async => http.Response(
              jsonEncode({
                'error': 'Recurso exclusivo para assinantes',
                'code': 'SUBSCRIPTION_REQUIRED',
              }),
              402,
            ),
          ),
        ),
      );

      await expectLater(
        api.simularAtivo(
          const AssetSimulationRequest(
            ticker: 'HGLG11',
            amount: 1000,
            months: 12,
          ),
        ),
        throwsA(
          predicate(
            (e) => e is ApiException && e.code == 'SUBSCRIPTION_REQUIRED',
          ),
        ),
      );
    },
  );
}
