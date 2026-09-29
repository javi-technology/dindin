import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/contracts/contracts.g.dart';
import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

// ---------------------------------------------------------------------------
// Operações de escrita (issue #403).
//
// Sem elas o app é um visualizador, e o usuário continua dependendo do
// computador para registrar uma compra — justamente no momento em que está
// longe dele, logo após operar pelo home broker.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late List<(String metodo, String caminho, Object? corpo)> enviadas;

  DinDinApi apiQue(Map<String, Object?> respostas) {
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
          if (corpo == null) return http.Response('', 204);
          return http.Response(jsonEncode(corpo), 201);
        }),
      ),
    );
  }

  final carteira = {
    'id': 'w1',
    'ownerId': 'u1',
    'name': 'Principal',
    'currency': 'BRL',
    'createdAt': '2026-01-01T00:00:00Z',
    'updatedAt': '2026-01-01T00:00:00Z',
  };

  final posicao = {
    'id': 'p1',
    'walletId': 'w1',
    'ticker': 'HGLG11',
    'assetType': 'FII',
    'quantity': 10,
    'averagePrice': 100.0,
    'inFridge': false,
    'createdAt': '2026-01-01T00:00:00Z',
    'updatedAt': '2026-01-01T00:00:00Z',
  };

  final item = {
    'id': 'i1',
    'fridgeId': 'f1',
    'ticker': 'MXRF11',
    'quantity': 100,
    'transferredPrice': 10.0,
    'targetPrice': 9.5,
    'createdAt': '2026-01-01T00:00:00Z',
    'updatedAt': '2026-01-01T00:00:00Z',
  };

  final provento = {
    'id': 'd1',
    'userId': 'u1',
    'ticker': 'HGLG11',
    'amountPerShare': 1.1,
    'quantity': 10,
    'totalAmount': 11.0,
    'paymentDate': '2026-09-15',
    'createdAt': '2026-09-15T00:00:00Z',
    'updatedAt': '2026-09-15T00:00:00Z',
  };

  group('carteira', () {
    test('cria', () async {
      final api = apiQue({'POST /api/wallets': carteira});

      final criada = await api.criarCarteira(
        const CreateWalletRequest(name: 'Principal', currency: 'BRL'),
      );

      expect(enviadas.single.$1, 'POST');
      expect(enviadas.single.$2, '/api/wallets');
      expect(enviadas.single.$3, {'name': 'Principal', 'currency': 'BRL'});
      expect(criada.id, 'w1');
    });

    test('edita', () async {
      final api = apiQue({'PUT /api/wallets/w1': carteira});

      await api.atualizarCarteira(
        'w1',
        const UpdateWalletRequest(name: 'Nova'),
      );

      expect(enviadas.single.$2, '/api/wallets/w1');
      expect(enviadas.single.$3, {'name': 'Nova'});
    });

    test('exclui', () async {
      final api = apiQue({});

      await api.excluirCarteira('w1');

      expect(enviadas.single.$1, 'DELETE');
    });
  });

  group('posição', () {
    test('cria', () async {
      final api = apiQue({'POST /api/wallets/w1/positions': posicao});

      await api.criarPosicao(
        'w1',
        const CreatePositionRequest(
          ticker: 'HGLG11',
          assetType: AssetType.fii,
          quantity: 10,
          averagePrice: 100,
        ),
      );

      expect(enviadas.single.$3, {
        'ticker': 'HGLG11',
        'assetType': 'FII',
        'quantity': 10.0,
        'averagePrice': 100.0,
      });
    });

    test('edita', () async {
      final api = apiQue({'PUT /api/wallets/w1/positions/p1': posicao});

      await api.atualizarPosicao(
        'w1',
        'p1',
        const UpdatePositionRequest(quantity: 20),
      );

      expect(enviadas.single.$2, '/api/wallets/w1/positions/p1');
    });

    // `targetPrice: null` é o que remove o preço-alvo gravado; omitir o campo
    // o manteria, e são pedidos diferentes.
    test('remove o preço-alvo enviando null explícito', () async {
      final api = apiQue({'PUT /api/wallets/w1/positions/p1': posicao});

      await api.atualizarPosicao(
        'w1',
        'p1',
        const UpdatePositionRequest(targetPrice: null),
        removerPrecoAlvo: true,
      );

      expect((enviadas.single.$3 as Map).containsKey('targetPrice'), isTrue);
      expect((enviadas.single.$3 as Map)['targetPrice'], isNull);
    });

    test('exclui', () async {
      final api = apiQue({});

      await api.excluirPosicao('w1', 'p1');

      expect(enviadas.single.$1, 'DELETE');
    });

    test('move para a geladeira', () async {
      final api = apiQue({
        'POST /api/wallets/w1/positions/p1/move-to-fridge': item,
      });

      final movido = await api.moverParaGeladeira(
        'w1',
        'p1',
        const MoveToFridgeRequest(fridgeId: 'f1', targetPrice: 9.5),
      );

      expect(enviadas.single.$2, '/api/wallets/w1/positions/p1/move-to-fridge');
      expect(movido.ticker, 'MXRF11');
    });
  });

  group('geladeira', () {
    test('cria item', () async {
      final api = apiQue({'POST /api/fridges/f1/items': item});

      await api.criarItemDaGeladeira(
        'f1',
        const CreateFridgeItemRequest(
          ticker: 'MXRF11',
          quantity: 100,
          transferredPrice: 10,
          targetPrice: 9.5,
        ),
      );

      expect(enviadas.single.$2, '/api/fridges/f1/items');
    });

    test('edita item', () async {
      final api = apiQue({'PUT /api/fridges/f1/items/i1': item});

      await api.atualizarItemDaGeladeira(
        'f1',
        'i1',
        const UpdateFridgeItemRequest(targetPrice: 9),
      );

      expect(enviadas.single.$3, {'targetPrice': 9.0});
    });

    test('exclui item', () async {
      final api = apiQue({});

      await api.excluirItemDaGeladeira('f1', 'i1');

      expect(enviadas.single.$1, 'DELETE');
    });

    test('retira o item de volta para a carteira', () async {
      final api = apiQue({'POST /api/fridges/f1/items/i1/unfreeze': posicao});

      final devolvida = await api.retirarDaGeladeira(
        'f1',
        'i1',
        const UnfreezeItemRequest(walletId: 'w1'),
      );

      expect(enviadas.single.$2, '/api/fridges/f1/items/i1/unfreeze');
      expect(devolvida.ticker, 'HGLG11');
    });
  });

  group('provento', () {
    test('cria', () async {
      final api = apiQue({'POST /api/dividends': provento});

      await api.criarProvento(
        const DividendCreateRequest(
          ticker: 'HGLG11',
          amountPerShare: 1.1,
          quantity: 10,
          paymentDate: '2026-09-15',
        ),
      );

      expect(enviadas.single.$2, '/api/dividends');
    });

    test('edita', () async {
      final api = apiQue({'PUT /api/dividends/d1': provento});

      await api.atualizarProvento(
        'd1',
        const DividendCreateRequest(
          ticker: 'HGLG11',
          amountPerShare: 1.2,
          quantity: 10,
          paymentDate: '2026-09-15',
        ),
      );

      expect(enviadas.single.$2, '/api/dividends/d1');
    });

    test('exclui', () async {
      final api = apiQue({});

      await api.excluirProvento('d1');

      expect(enviadas.single.$1, 'DELETE');
    });
  });
}
