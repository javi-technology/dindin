import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/assinatura/assinatura_service.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';
import 'package:dindin_mobile/core/data/dindin_api.dart';

// ---------------------------------------------------------------------------
// Status da assinatura no app (issue #442).
//
// O app não lia `/api/me` e tratava todo mundo como não assinante: quem já
// paga pela web abria o app e via o recurso bloqueado. A compra in-app (#405)
// é outro assunto — aqui é só reconhecer quem já assina.
// ---------------------------------------------------------------------------

class _ComToken implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late int chamadas;

  DinDinApi apiQue(List<String> entitlements, {int status = 200}) {
    chamadas = 0;
    return DinDinApi(
      ApiClient(
        baseUrl: 'https://api.exemplo',
        tokenProvider: _ComToken(),
        httpClient: MockClient((req) async {
          chamadas += 1;
          return http.Response(
            jsonEncode({
              'uid': 'u1',
              'admin': false,
              'subscription': {'status': 'active', 'cancelAtPeriodEnd': false},
              'entitlements': entitlements,
            }),
            status,
          );
        }),
      ),
    );
  }

  test('lê o perfil em GET /api/me', () async {
    final api = apiQue(['projections']);

    final perfil = await api.perfil();

    expect(perfil.uid, 'u1');
    expect(perfil.entitlements.map((e) => e.wire), contains('projections'));
  });

  group('AssinaturaService', () {
    test('libera as projeções para quem tem o entitlement', () async {
      final service = AssinaturaService(apiQue(['projections']));

      await service.carregar();

      expect(service.temProjecoes, isTrue);
    });

    test('mantém bloqueado quem não tem o entitlement', () async {
      final service = AssinaturaService(apiQue(['ai']));

      await service.carregar();

      expect(service.temProjecoes, isFalse);
    });

    // Antes da resposta, o app não pode liberar o recurso pago no otimismo: a
    // API devolveria 402 e o usuário veria um erro cru no lugar da explicação.
    test('começa bloqueado, antes de carregar', () {
      final service = AssinaturaService(apiQue(['projections']));

      expect(service.temProjecoes, isFalse);
    });

    test('falha ao carregar não libera o recurso', () async {
      final service = AssinaturaService(apiQue(['projections'], status: 500));

      await service.carregar();

      expect(service.temProjecoes, isFalse);
    });

    test('avisa quem escuta quando o status chega', () async {
      final service = AssinaturaService(apiQue(['projections']));
      var avisos = 0;
      service.addListener(() => avisos += 1);

      await service.carregar();

      expect(avisos, 1);
      expect(chamadas, 1);
    });
  });
}
