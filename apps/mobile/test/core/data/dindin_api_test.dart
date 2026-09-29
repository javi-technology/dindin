import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

// ---------------------------------------------------------------------------
// Consumo das rotas existentes pelos modelos gerados da descrição OpenAPI
// (issues #399 e #402).
//
// O que se garante aqui é que o app fala com a API pelos contratos gerados, e
// não por leitura de `Map` campo a campo: um campo renomeado na API quebra a
// compilação do app, em vez de aparecer como zero no celular do usuário.
// ---------------------------------------------------------------------------

class _SemToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late List<String> chamadas;

  DinDinApi apiQue(Map<String, Object?> respostasPorCaminho) {
    chamadas = [];

    return DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _SemToken(),
        httpClient: MockClient((req) async {
          chamadas.add('${req.method} ${req.url.path}');
          final corpo = respostasPorCaminho[req.url.path];
          if (corpo == null) return http.Response('{"error":"nao"}', 404);
          return http.Response(jsonEncode(corpo), 200);
        }),
      ),
    );
  }

  test('resumo do patrimônio vem tipado', () async {
    final api = apiQue({
      '/api/dashboard/summary': {
        'totalWallet': 1000.0,
        'totalFridge': 250.5,
        'total': 1250.5,
        'monthlyIncomeTotal': 12.75,
        'composition': [
          {'ticker': 'HGLG11', 'value': 1000.0},
        ],
      },
    });

    final resumo = await api.resumoDoPatrimonio();

    expect(chamadas, ['GET /api/dashboard/summary']);
    expect(resumo.total, 1250.5);
    expect(resumo.composition.first.ticker, 'HGLG11');
  });

  test('carteiras vêm tipadas', () async {
    final api = apiQue({
      '/api/wallets': [
        {
          'id': 'w1',
          'ownerId': 'u1',
          'name': 'Principal',
          'currency': 'BRL',
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
        },
      ],
    });

    final carteiras = await api.carteiras();

    expect(carteiras.single.name, 'Principal');
  });

  test('posições de uma carteira vêm tipadas', () async {
    final api = apiQue({
      '/api/wallets/w1/positions': [
        {
          'id': 'p1',
          'walletId': 'w1',
          'ticker': 'HGLG11',
          'assetType': 'FII',
          'quantity': 10,
          'averagePrice': 100.0,
          'inFridge': false,
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
        },
      ],
    });

    final posicoes = await api.posicoes('w1');

    expect(chamadas, ['GET /api/wallets/w1/positions']);
    expect(posicoes.single.ticker, 'HGLG11');
    expect(posicoes.single.assetType.wire, 'FII');
  });

  // A API devolve `10` para um valor monetário redondo, e o Dart recusa `int`
  // onde espera `double`: sem a conversão, isso seria erro em tempo de
  // execução no celular, num caso que o web nem nota.
  test('aceita número inteiro onde o contrato diz decimal', () async {
    final api = apiQue({
      '/api/dashboard/summary': {
        'totalWallet': 1000,
        'totalFridge': 0,
        'total': 1000,
        'monthlyIncomeTotal': 0,
        'composition': <Object>[],
      },
    });

    expect((await api.resumoDoPatrimonio()).total, 1000.0);
  });

  test('geladeiras e itens vêm tipados', () async {
    final api = apiQue({
      '/api/fridges': [
        {
          'id': 'f1',
          'ownerId': 'u1',
          'name': 'Oportunidades',
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
        },
      ],
      '/api/fridges/f1/items': [
        {
          'id': 'i1',
          'fridgeId': 'f1',
          'ticker': 'MXRF11',
          'quantity': 100,
          'transferredPrice': 10.0,
          'targetPrice': 9.5,
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect((await api.geladeiras()).single.name, 'Oportunidades');
    expect((await api.itensDaGeladeira('f1')).single.ticker, 'MXRF11');
  });

  test('proventos recebidos vêm tipados', () async {
    final api = apiQue({
      '/api/dividends': [
        {
          'id': 'd1',
          'userId': 'u1',
          'ticker': 'HGLG11',
          'amountPerShare': 1.1,
          'quantity': 10,
          'totalAmount': 11.0,
          'paymentDate': '2026-09-15',
          'createdAt': '2026-09-15T00:00:00Z',
          'updatedAt': '2026-09-15T00:00:00Z',
        },
      ],
    });

    expect((await api.proventos()).single.totalAmount, 11.0);
  });

  test('projeção de proventos vem tipada', () async {
    final api = apiQue({
      '/api/dividends/projection': {
        'byTicker': [
          {
            'ticker': 'HGLG11',
            'quantity': 10,
            'monthlyDividend': 1.1,
            'monthlyIncome': 11.0,
          },
        ],
        'total': 11.0,
        'totalFromFridge': 0,
      },
    });

    expect((await api.projecaoDeProventos()).total, 11.0);
  });
}
