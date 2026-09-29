import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/data/cache_local.dart';

// ---------------------------------------------------------------------------
// Cache local das consultas (issue #402).
//
// Uma lista que só aparece depois de a rede responder deixa o app inutilizável
// no elevador ou no metrô. O cache guarda o último estado conhecido para a
// abertura mostrar algo enquanto busca o atual — e guarda **quando** foi
// gravado, porque o usuário precisa saber que aquele número pode estar velho.
// ---------------------------------------------------------------------------
void main() {
  late CacheLocal cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = await CacheLocal.abrir();
  });

  test('não devolve nada antes da primeira gravação', () async {
    expect(cache.ler('carteiras'), isNull);
  });

  test('devolve o que foi gravado', () async {
    await cache.gravar('carteiras', [
      {'id': 'w1'},
    ]);

    final guardado = cache.ler('carteiras');

    expect(guardado!.dados, [
      {'id': 'w1'},
    ]);
  });

  test('guarda quando foi gravado', () async {
    final antes = DateTime.now().subtract(const Duration(seconds: 1));
    await cache.gravar('resumo', {'total': 10});

    expect(cache.ler('resumo')!.gravadoEm.isAfter(antes), isTrue);
  });

  test('a gravação sobrescreve a anterior', () async {
    await cache.gravar('resumo', {'total': 10});
    await cache.gravar('resumo', {'total': 20});

    expect(cache.ler('resumo')!.dados, {'total': 20});
  });

  test('chaves diferentes não se misturam', () async {
    await cache.gravar('carteiras', [1]);
    await cache.gravar('geladeiras', [2]);

    expect(cache.ler('carteiras')!.dados, [1]);
    expect(cache.ler('geladeiras')!.dados, [2]);
  });

  test('sobrevive à reabertura do app', () async {
    await cache.gravar('resumo', {'total': 10});

    expect((await CacheLocal.abrir()).ler('resumo')!.dados, {'total': 10});
  });

  // Entrada corrompida não pode impedir o app de abrir: o cache é
  // conveniência, e perdê-lo custa uma espera, não o acesso.
  test('entrada corrompida é descartada em silêncio', () async {
    SharedPreferences.setMockInitialValues({
      'dindin-cache:resumo': 'isto não é json',
    });

    expect((await CacheLocal.abrir()).ler('resumo'), isNull);
  });

  test('limpar apaga tudo do cache', () async {
    await cache.gravar('carteiras', [1]);
    await cache.gravar('resumo', {'total': 10});

    await cache.limpar();

    expect(cache.ler('carteiras'), isNull);
    expect(cache.ler('resumo'), isNull);
  });

  // O cache é do usuário autenticado: deixá-lo para trás mostraria a carteira
  // de quem saiu para quem entrar depois no mesmo aparelho.
  test('limpar não toca em outras preferências', () async {
    SharedPreferences.setMockInitialValues({'dindin-theme': 'dark'});
    final comTema = await CacheLocal.abrir();
    await comTema.gravar('resumo', {'total': 10});

    await comTema.limpar();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('dindin-theme'), 'dark');
  });
}
