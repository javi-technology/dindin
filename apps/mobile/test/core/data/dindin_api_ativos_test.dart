import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

// Catálogo de ativos (issue #443): é o que alimenta as sugestões de ticker
// nos formulários, no lugar da digitação às cegas.

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  test('lista os ativos ativos em GET /api/assets', () async {
    String? pedido;
    final api = DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient((req) async {
          pedido = '${req.method} ${req.url.path}';
          return http.Response(
            jsonEncode([
              {
                'ticker': 'HGLG11',
                'name': 'CSHG Logistica',
                'assetType': 'FII',
                'active': true,
                'createdAt': '2026-09-01T00:00:00Z',
                'updatedAt': '2026-09-01T00:00:00Z',
              },
            ]),
            200,
          );
        }),
      ),
    );

    final ativos = await api.ativos();

    expect(pedido, 'GET /api/assets');
    expect(ativos.single.ticker, 'HGLG11');
    expect(ativos.single.assetType, AssetType.fii);
  });
}
