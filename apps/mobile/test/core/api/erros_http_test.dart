import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:dindin_mobile/core/api/api_client.dart';
import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/api/aviso_de_limite.dart';
import 'package:dindin_mobile/core/auth/token_provider.dart';

// ---------------------------------------------------------------------------
// Matriz de erros HTTP (issue #505) — as mesmas linhas, com os mesmos textos,
// que o web trata no `httpErrorInterceptor`. Ver docs/tratamento-erros-http.md.
// 401 e 426 têm testes próprios (api_client_test e atualizacao_obrigatoria).
// ---------------------------------------------------------------------------

class _Token implements TokenProvider {
  @override
  Future<String?> idToken({bool forceRefresh = false}) async => 'token';
}

void main() {
  late AvisoDeLimite aviso;

  setUp(() => aviso = AvisoDeLimite());
  tearDown(() => aviso.dispensar());

  ApiClient clienteQueResponde(
    String corpo,
    int status, {
    Map<String, String> headers = const {},
  }) => ApiClient(
    baseUrl: 'https://api.exemplo',
    tokenProvider: _Token(),
    httpClient: MockClient(
      (_) async => http.Response(
        corpo,
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...headers,
        },
      ),
    ),
    avisoDeLimite: aviso,
  );

  Future<ApiException> falha(ApiClient client) async {
    try {
      await client.get('/api/wallets');
    } on ApiException catch (e) {
      return e;
    }
    fail('esperava ApiException');
  }

  group('429 de rate limit (code RATE_LIMITED)', () {
    const limite = '{"error":"Muitas requisições","code":"RATE_LIMITED"}';

    test('avisa a espera pedida pelo Retry-After, em qualquer tela', () async {
      await falha(
        clienteQueResponde(limite, 429, headers: {'retry-after': '42'}),
      );

      expect(aviso.segundos, 42);
    });

    test('assume um minuto quando a resposta não diz quanto esperar', () async {
      await falha(clienteQueResponde(limite, 429));

      expect(aviso.segundos, 60);
    });

    test('troca a mensagem por um texto em pt-BR com a espera', () async {
      final erro = await falha(
        clienteQueResponde(limite, 429, headers: {'retry-after': '42'}),
      );

      expect(erro.statusCode, 429);
      expect(erro.code, 'RATE_LIMITED');
      expect(
        erro.message,
        'Muitas requisições. Aguarde 42 segundos e tente de novo.',
      );
    });

    test('usa o singular quando falta um segundo', () async {
      final erro = await falha(
        clienteQueResponde(limite, 429, headers: {'retry-after': '1'}),
      );

      expect(erro.message, contains('1 segundo e'));
    });
  });

  test('429 de negócio mantém o texto da API e não avisa', () async {
    final erro = await falha(
      clienteQueResponde(
        '{"error":"Limite diário de sugestões atingido"}',
        429,
      ),
    );

    expect(erro.message, 'Limite diário de sugestões atingido');
    expect(aviso.segundos, isNull);
  });

  for (final status in [502, 503, 504]) {
    test(
      '$status sem texto da API vira mensagem de indisponibilidade',
      () async {
        final erro = await falha(clienteQueResponde('', status));

        expect(
          erro.message,
          'O serviço está indisponível no momento. Tente de novo em instantes.',
        );
      },
    );
  }

  test('502 com texto escrito pela API (provedor de IA) é mantido', () async {
    final erro = await falha(
      clienteQueResponde('{"error":"A IA está indisponível agora"}', 502),
    );

    expect(erro.message, 'A IA está indisponível agora');
  });

  test('500 mantém a mensagem genérica da API', () async {
    final erro = await falha(
      clienteQueResponde('{"error":"Erro interno do servidor"}', 500),
    );

    expect(erro.message, 'Erro interno do servidor');
  });

  for (final status in [400, 404, 409]) {
    test('$status repassa mensagem e código da API', () async {
      final erro = await falha(
        clienteQueResponde('{"error":"Mensagem da API","code":"X"}', status),
      );

      expect(erro.statusCode, status);
      expect(erro.message, 'Mensagem da API');
      expect(erro.code, 'X');
    });
  }

  test(
    '403 SUBSCRIPTION_REQUIRED mantém o código para oferecer a assinatura',
    () async {
      final erro = await falha(
        clienteQueResponde(
          '{"error":"Assinatura necessária","code":"SUBSCRIPTION_REQUIRED"}',
          403,
        ),
      );

      expect(erro.code, 'SUBSCRIPTION_REQUIRED');
    },
  );

  test('falha de rede tem o mesmo texto do web', () {
    expect(
      const NetworkException().message,
      'Sem conexão com o servidor. Tente de novo.',
    );
  });
}
