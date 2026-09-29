import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';
import 'package:dindin_mobile/core/setup/setup_service.dart';

// ---------------------------------------------------------------------------
// Provisionamento da Carteira e da Geladeira Principal no app (issue #440).
//
// O web faz isso no `authGuard`, antes de qualquer tela que dependa desses
// recursos. O app não fazia, e quem se cadastrava por ele ficava sem geladeira
// — sem meio de criar uma, porque o app não oferece essa operação. As duas
// mensagens que mandavam "crie uma geladeira" pediam o impossível.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late List<(String, String, Object?)> enviadas;

  DinDinApi apiQue({int status = 200}) {
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
          return http.Response(
            jsonEncode({'walletCreated': true, 'fridgeCreated': true}),
            status,
          );
        }),
      ),
    );
  }

  group('DinDinApi', () {
    test('provisiona os padrões em POST /api/me/setup', () async {
      final api = apiQue();

      await api.provisionarPadroes();

      expect(enviadas, [('POST', '/api/me/setup', <String, dynamic>{})]);
    });
  });

  group('SetupService', () {
    test('provisiona uma vez por usuário', () async {
      final api = apiQue();
      final service = SetupService(api);

      await service.garantirPadroes('uid-1');
      await service.garantirPadroes('uid-1');

      expect(enviadas, hasLength(1));
    });

    // Trocar de conta no mesmo aparelho é comum, e a segunda conta precisa dos
    // próprios recursos.
    test('provisiona de novo quando o usuário muda', () async {
      final api = apiQue();
      final service = SetupService(api);

      await service.garantirPadroes('uid-1');
      await service.garantirPadroes('uid-2');

      expect(enviadas, hasLength(2));
    });

    // Sem rede, o app continua utilizável com o que estiver em cache: quem
    // já tem carteira não pode ficar preso numa tela de carregamento.
    test('não propaga a falha do provisionamento', () async {
      final api = apiQue(status: 500);
      final service = SetupService(api);

      await expectLater(service.garantirPadroes('uid-1'), completes);
    });
  });
}
