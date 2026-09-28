import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';

// ---------------------------------------------------------------------------
// O backend valida ID token do Firebase e não muda para o app (issue #400).
// O que muda é quem manda o token: toda requisição leva o dele, e um token
// vencido é renovado sem o usuário perceber — deslogar no meio de um envio
// de posição é perder dado financeiro que ele acabou de digitar.
// ---------------------------------------------------------------------------

/// Devolve tokens em sequência, registrando quando renovaram à força.
class _TokenFalso implements TokenProvider {
  _TokenFalso(this._tokens);

  final List<String?> _tokens;
  int _lidos = 0;
  final List<bool> renovacoes = [];

  @override
  Future<String?> idToken({bool forceRefresh = false}) async {
    renovacoes.add(forceRefresh);
    final token = _tokens[_lidos.clamp(0, _tokens.length - 1)];
    _lidos++;
    return token;
  }
}

void main() {
  late _TokenFalso tokens;

  setUp(() => tokens = _TokenFalso(['token-1']));

  ApiClient clienteCom(MockClient http_) => ApiClient(
    baseUrl: 'https://api.exemplo',
    tokenProvider: tokens,
    httpClient: http_,
  );

  group('ID token', () {
    test('vai em toda requisição', () async {
      late http.Request enviada;
      final client = clienteCom(
        MockClient((req) async {
          enviada = req;
          return http.Response('{"uid":"u1"}', 200);
        }),
      );

      await client.get('/api/me');

      expect(enviada.headers['Authorization'], 'Bearer token-1');
    });

    test('não é exigido quando não há sessão', () async {
      tokens = _TokenFalso([null]);
      late http.Request enviada;
      final client = clienteCom(
        MockClient((req) async {
          enviada = req;
          return http.Response('{}', 200);
        }),
      );

      await client.get('/api/health');

      expect(enviada.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('token vencido', () {
    test('é renovado e a requisição que falhou é repetida', () async {
      tokens = _TokenFalso(['vencido', 'novo']);
      final autorizacoes = <String?>[];
      final client = clienteCom(
        MockClient((req) async {
          autorizacoes.add(req.headers['Authorization']);
          if (autorizacoes.length == 1) {
            return http.Response('{"error":"expirado"}', 401);
          }
          return http.Response('{"uid":"u1"}', 200);
        }),
      );

      final corpo = await client.get('/api/me');

      expect(autorizacoes, ['Bearer vencido', 'Bearer novo']);
      expect(tokens.renovacoes, [false, true]);
      expect(corpo, {'uid': 'u1'});
    });

    test('não repete mais de uma vez, para não entrar em laço', () async {
      tokens = _TokenFalso(['vencido', 'ainda-vencido']);
      var chamadas = 0;
      final client = clienteCom(
        MockClient((req) async {
          chamadas++;
          return http.Response('{"error":"expirado"}', 401);
        }),
      );

      await expectLater(
        client.get('/api/me'),
        throwsA(isA<UnauthorizedException>()),
      );
      expect(chamadas, 2);
    });
  });

  group('erros', () {
    test('401 persistente vira UnauthorizedException', () async {
      final client = clienteCom(
        MockClient((req) async => http.Response('{"error":"nao"}', 401)),
      );

      await expectLater(
        client.get('/api/me'),
        throwsA(isA<UnauthorizedException>()),
      );
    });

    // A API responde em pt-BR nos 4xx justamente porque a mensagem chega à
    // tela; descartá-la faria o app inventar um texto genérico no lugar.
    test('preserva a mensagem de erro da API', () async {
      final client = clienteCom(
        MockClient(
          (req) async => http.Response(
            jsonEncode({'error': 'Carteira não encontrada'}),
            404,
          ),
        ),
      );

      await expectLater(
        client.get('/api/wallets/x'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 404)
              .having((e) => e.message, 'message', 'Carteira não encontrada'),
        ),
      );
    });

    test('expõe o code de contrato do corpo', () async {
      final client = clienteCom(
        MockClient(
          (req) async => http.Response(
            jsonEncode({'error': 'assine', 'code': 'SUBSCRIPTION_REQUIRED'}),
            402,
          ),
        ),
      );

      await expectLater(
        client.post('/api/simulations/asset', body: const {}),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'SUBSCRIPTION_REQUIRED',
          ),
        ),
      );
    });

    test('falha de rede vira NetworkException', () async {
      final client = clienteCom(
        MockClient((req) async => throw const SocketExceptionFalsa()),
      );

      await expectLater(
        client.get('/api/me'),
        throwsA(isA<NetworkException>()),
      );
    });
  });

  group('corpo', () {
    test('envia JSON no POST', () async {
      late http.Request enviada;
      final client = clienteCom(
        MockClient((req) async {
          enviada = req;
          return http.Response('{"id":"w1"}', 201);
        }),
      );

      await client.post('/api/wallets', body: {'name': 'Minha'});

      expect(enviada.headers['Content-Type'], contains('application/json'));
      expect(jsonDecode(enviada.body), {'name': 'Minha'});
    });

    test('aceita 204 sem corpo', () async {
      final client = clienteCom(MockClient((req) async => http.Response('', 204)));

      expect(await client.delete('/api/wallets/w1'), isNull);
    });
  });
}

/// `SocketException` vive em `dart:io`, que o teste não importa de propósito:
/// o que o cliente precisa reconhecer é qualquer falha de transporte.
class SocketExceptionFalsa implements Exception {
  const SocketExceptionFalsa();
}
