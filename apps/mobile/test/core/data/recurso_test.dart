import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/data/cache_local.dart';
import 'package:dindin_mobile/core/data/recurso.dart';

// ---------------------------------------------------------------------------
// Ciclo de vida de uma consulta (issue #402).
//
// A abertura do app mostra o último estado conhecido enquanto busca o atual,
// e diz que aquilo veio do cache. Sem isso, o usuário no metrô olha para uma
// tela vazia; com isso, mas sem o aviso, ele toma decisão financeira sobre um
// número velho achando que é o de agora.
// ---------------------------------------------------------------------------
void main() {
  late CacheLocal cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = await CacheLocal.abrir();
  });

  Recurso<int> recurso({
    required Future<int> Function() buscar,
    String chave = 'numero',
  }) => Recurso<int>(
    chave: chave,
    cache: cache,
    buscar: buscar,
    serializar: (valor) => {'v': valor},
    desserializar: (json) => (json as Map<String, dynamic>)['v'] as int,
  );

  test('começa carregando', () {
    final r = recurso(buscar: () async => 1);

    expect(r.estado.carregando, isTrue);
    expect(r.estado.dados, isNull);
  });

  test('entrega os dados da rede', () async {
    final r = recurso(buscar: () async => 42);

    await r.carregar();

    expect(r.estado.dados, 42);
    expect(r.estado.carregando, isFalse);
    expect(r.estado.doCache, isFalse);
  });

  test('avisa quem observa', () async {
    final r = recurso(buscar: () async => 42);
    var avisos = 0;
    r.addListener(() => avisos++);

    await r.carregar();

    expect(avisos, greaterThan(0));
  });

  group('cache', () {
    test('a resposta da rede é guardada', () async {
      await recurso(buscar: () async => 42).carregar();

      expect(cache.ler('numero')!.dados, {'v': 42});
    });

    test('o cache aparece antes da rede responder', () async {
      await cache.gravar('numero', {'v': 7});
      final r = recurso(buscar: () async => 42);

      final emAndamento = r.carregar();

      expect(r.estado.dados, 7);
      expect(r.estado.doCache, isTrue);
      expect(r.estado.carregando, isTrue);

      await emAndamento;
      expect(r.estado.dados, 42);
      expect(r.estado.doCache, isFalse);
    });

    // Falhar a rede com cache em mãos é o caso do metrô: mostrar o número
    // antigo, marcado como antigo, vale mais do que uma tela de erro.
    test('falha de rede com cache mantém o dado, marcado como do cache', () async {
      await cache.gravar('numero', {'v': 7});
      final r = recurso(buscar: () async => throw const NetworkException());

      await r.carregar();

      expect(r.estado.dados, 7);
      expect(r.estado.doCache, isTrue);
      expect(r.estado.erro, isNotNull);
    });

    test('cache corrompido para o tipo é ignorado', () async {
      await cache.gravar('numero', {'outro': 'campo'});
      final r = recurso(buscar: () async => 42);

      await r.carregar();

      expect(r.estado.dados, 42);
    });
  });

  group('erro', () {
    test('sem cache, a falha vira erro com mensagem', () async {
      final r = recurso(buscar: () async => throw const NetworkException());

      await r.carregar();

      expect(r.estado.dados, isNull);
      expect(r.estado.erro, 'Sem conexão com o servidor. Tente de novo.');
    });

    test('preserva a mensagem em português da API', () async {
      final r = recurso(
        buscar: () async => throw const ApiException(
          statusCode: 404,
          message: 'Carteira não encontrada',
        ),
      );

      await r.carregar();

      expect(r.estado.erro, 'Carteira não encontrada');
    });

    test('nova tentativa limpa o erro e busca de novo', () async {
      var tentativas = 0;
      final r = recurso(
        buscar: () async {
          tentativas++;
          if (tentativas == 1) throw const NetworkException();
          return 42;
        },
      );

      await r.carregar();
      expect(r.estado.erro, isNotNull);

      await r.carregar();

      expect(r.estado.erro, isNull);
      expect(r.estado.dados, 42);
      expect(tentativas, 2);
    });
  });
}
