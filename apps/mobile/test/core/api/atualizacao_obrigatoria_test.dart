import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/api/atualizacao_obrigatoria.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';

// ---------------------------------------------------------------------------
// Política de compatibilidade entre o app instalado e a API (issue #500)
//
// O app continua rodando a versão antiga depois de um deploy da API. Ele
// informa a versão em todo pedido; abaixo da mínima a API responde 426 com
// `APP_UPDATE_REQUIRED`, e o app passa a exigir a atualização em vez de
// mostrar erro de parsing numa tela qualquer.
// ---------------------------------------------------------------------------

class _Token implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  ApiClient clienteCom(
    MockClient http_, {
    String? versao,
    AtualizacaoObrigatoria? atualizacao,
  }) => ApiClient(
    baseUrl: 'https://api.exemplo',
    tokenProvider: _Token(),
    httpClient: http_,
    versaoDoApp: versao,
    atualizacao: atualizacao,
  );

  test('manda a versão instalada em toda requisição', () async {
    late http.Request enviada;
    final client = clienteCom(
      MockClient((req) async {
        enviada = req;
        return http.Response('{}', 200);
      }),
      versao: '1.4.2',
    );

    await client.get('/api/me');

    expect(enviada.headers['X-App-Version'], '1.4.2');
  });

  test('sem versão conhecida, não manda o cabeçalho', () async {
    late http.Request enviada;
    final client = clienteCom(
      MockClient((req) async {
        enviada = req;
        return http.Response('{}', 200);
      }),
    );

    await client.get('/api/me');

    expect(enviada.headers.containsKey('X-App-Version'), isFalse);
  });

  test('426 com APP_UPDATE_REQUIRED exige a atualização do app', () async {
    final atualizacao = AtualizacaoObrigatoria();
    final client = clienteCom(
      MockClient(
        (_) async => http.Response(
          '{"error":"Atualize o DinDin.","code":"APP_UPDATE_REQUIRED"}',
          426,
        ),
      ),
      versao: '1.0.0',
      atualizacao: atualizacao,
    );

    await expectLater(
      client.get('/api/me'),
      throwsA(isA<AtualizacaoObrigatoriaException>()),
    );
    expect(atualizacao.exigida, isTrue);
  });

  test('426 sem o código de contrato é um erro comum', () async {
    final atualizacao = AtualizacaoObrigatoria();
    final client = clienteCom(
      MockClient((_) async => http.Response('{"error":"x"}', 426)),
      atualizacao: atualizacao,
    );

    await expectLater(
      client.get('/api/me'),
      throwsA(
        isA<ApiException>().having(
          (e) => e is AtualizacaoObrigatoriaException,
          'é atualização',
          isFalse,
        ),
      ),
    );
    expect(atualizacao.exigida, isFalse);
  });

  test('notifica quem escuta quando a atualização passa a ser exigida', () {
    final atualizacao = AtualizacaoObrigatoria();
    var avisos = 0;
    atualizacao.addListener(() => avisos++);

    atualizacao.exigir();
    atualizacao.exigir();

    expect(avisos, 1);
  });
}
