import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:dindin_mobile/core/data/cache_local.dart';

import '../../support/cache_de_teste.dart';

// ---------------------------------------------------------------------------
// Cache local das consultas (issue #402).
//
// Uma lista que só aparece depois de a rede responder deixa o app inutilizável
// no elevador ou no metrô. O cache guarda o último estado conhecido para a
// abertura mostrar algo enquanto busca o atual — e guarda **quando** foi
// gravado, porque o usuário precisa saber que aquele número pode estar velho.
// ---------------------------------------------------------------------------
void main() {
  late ArmazenamentoEmMemoria armazenamento;
  late CacheLocal cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    armazenamento = ArmazenamentoEmMemoria();
    cache = await cacheDeTeste(armazenamento: armazenamento);
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

    final reaberto = await CacheLocal.abrir(armazenamento: armazenamento);
    await reaberto.vincularA('usuario-teste');

    expect(reaberto.ler('resumo')!.dados, {'total': 10});
  });

  // Entrada corrompida não pode impedir o app de abrir: o cache é
  // conveniência, e perdê-lo custa uma espera, não o acesso.
  test('entrada corrompida é descartada em silêncio', () async {
    await armazenamento.gravar(
      CacheLocal.chaveNoArmazenamento('usuario-teste', 'resumo'),
      'isto não é json',
    );

    final reaberto = await CacheLocal.abrir(armazenamento: armazenamento);
    await reaberto.vincularA('usuario-teste');

    expect(reaberto.ler('resumo'), isNull);
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
    final comTema = await cacheDeTeste();
    await comTema.gravar('resumo', {'total': 10});

    await comTema.limpar();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('dindin-theme'), 'dark');
  });

  // -------------------------------------------------------------------------
  // De quem é o cache (issue #498)
  //
  // O cache guarda patrimônio, carteiras e proventos. Ele pertence ao usuário
  // que o gravou: se a sessão termina por um caminho que não é o botão de
  // sair (token revogado, conta removida, 401 que sobrevive à renovação), quem
  // entrar depois no mesmo aparelho não pode ver a carteira do anterior.
  // -------------------------------------------------------------------------
  group('dono do cache', () {
    test('não lê nem grava enquanto não há usuário vinculado', () async {
      final semDono = await CacheLocal.abrir(
        armazenamento: ArmazenamentoEmMemoria(),
      );

      await semDono.gravar('resumo', {'total': 10});

      expect(semDono.dono, isNull);
      expect(semDono.ler('resumo'), isNull);
    });

    test('não devolve a outro usuário o que o primeiro gravou', () async {
      await cache.gravar('carteiras', [1]);

      await cache.vincularA('outro-usuario');

      expect(cache.dono, 'outro-usuario');
      expect(cache.ler('carteiras'), isNull);
    });

    test('apaga do armazenamento o que era do usuário anterior', () async {
      await cache.gravar('carteiras', [1]);

      await cache.vincularA('outro-usuario');

      expect((await armazenamento.lerTudo()).keys, isEmpty);
    });

    test('mantém o cache quando o mesmo usuário se vincula de novo', () async {
      await cache.gravar('carteiras', [1]);

      await cache.vincularA('usuario-teste');

      expect(cache.ler('carteiras')!.dados, [1]);
    });

    test('guarda separado o que cada chave tem de cada usuário', () async {
      await cache.gravar('carteiras', [1]);
      final outro = await cacheDeTeste(uid: 'outro-usuario');
      await outro.gravar('carteiras', [2]);

      expect(cache.ler('carteiras')!.dados, [1]);
      expect(outro.ler('carteiras')!.dados, [2]);
    });

    test('encerrar a sessão apaga tudo e desvincula', () async {
      await cache.gravar('carteiras', [1]);
      await cache.gravar('resumo', {'total': 10});

      await cache.vincularA(null);

      expect(cache.dono, isNull);
      expect(cache.ler('carteiras'), isNull);
      expect((await armazenamento.lerTudo()).keys, isEmpty);
    });

    test('não grava depois de a sessão encerrar', () async {
      await cache.vincularA(null);

      await cache.gravar('resumo', {'total': 10});

      expect((await armazenamento.lerTudo()).keys, isEmpty);
    });
  });

  // -------------------------------------------------------------------------
  // Onde o cache fica (issue #498)
  //
  // As preferências do sistema guardam em texto puro, legível por backup do
  // aparelho e por quem tiver acesso ao arquivo. Patrimônio e carteira vão
  // para o armazenamento seguro (Keychain no iOS, Keystore no Android).
  // -------------------------------------------------------------------------
  group('armazenamento', () {
    test('grava no armazenamento seguro, e não nas preferências', () async {
      await cache.gravar('resumo', {'total': 10});

      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getKeys().where((chave) => chave.startsWith('dindin-cache')),
        isEmpty,
      );
      expect(
        (await armazenamento.lerTudo()).keys,
        contains(CacheLocal.chaveNoArmazenamento('usuario-teste', 'resumo')),
      );
    });

    // Quem já usa o app tem o cache em texto puro. Trocar o destino sem
    // apagá-lo deixaria a carteira legível no aparelho para sempre.
    test(
      'apaga o cache em texto puro deixado pelas versões anteriores',
      () async {
        SharedPreferences.setMockInitialValues({
          'dindin-cache:resumo':
              '{"dados":{"total":10},"gravadoEm":"2026-01-01T00:00:00.000"}',
          'dindin-theme': 'dark',
        });

        await CacheLocal.abrir(armazenamento: ArmazenamentoEmMemoria());

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('dindin-cache:resumo'), isNull);
        expect(prefs.getString('dindin-theme'), 'dark');
      },
    );

    test('uma falha ao gravar não derruba o app', () async {
      final quebrado = ArmazenamentoEmMemoria()..falharAoGravar = true;
      final comFalha = await cacheDeTeste(armazenamento: quebrado);

      await comFalha.gravar('resumo', {'total': 10});

      // O cache é conveniência: perder a gravação custa uma espera.
      expect(comFalha.ler('resumo'), isNull);
    });
  });

  // -------------------------------------------------------------------------
  // Vínculos que se atropelam (revisão do PR #518)
  //
  // A sessão pode mudar mais depressa do que o armazenamento responde (sair e
  // entrar logo em seguida). A leitura iniciada para o primeiro usuário que
  // termina depois do vínculo do segundo não pode pôr a carteira dele no cache
  // de quem está na frente.
  // -------------------------------------------------------------------------
  group('vínculos simultâneos', () {
    String entrada(Object dados) => jsonEncode({
      'dados': dados,
      'gravadoEm': DateTime(2026, 10, 1).toIso8601String(),
    });

    late ArmazenamentoEmMemoria disco;
    late CacheLocal aberto;

    setUp(() async {
      disco = ArmazenamentoEmMemoria();
      await disco.gravar(
        CacheLocal.chaveNoArmazenamento('A', 'carteiras'),
        entrada(['carteira de A']),
      );
      await disco.gravar(
        CacheLocal.chaveNoArmazenamento('B', 'carteiras'),
        entrada(['carteira de B']),
      );
      aberto = await CacheLocal.abrir(armazenamento: disco);
      disco.segurarLeituras = true;
    });

    test('a leitura de A que termina depois do vínculo de B não entra no '
        'cache de B', () async {
      final vincularA = aberto.vincularA('A');
      final vincularB = aberto.vincularA('B');

      // B termina primeiro; a leitura de A volta depois, já com B na frente.
      disco.liberarLeitura(1);
      await vincularB;
      disco.liberarLeitura(0);
      await vincularA;

      expect(aberto.dono, 'B');
      expect(aberto.ler('carteiras')!.dados, ['carteira de B']);
    });

    test('o vínculo atrasado de A não apaga o que é de B', () async {
      final vincularA = aberto.vincularA('A');
      final vincularB = aberto.vincularA('B');

      disco.liberarLeitura(1);
      await vincularB;
      disco.liberarLeitura(0);
      await vincularA;

      disco.segurarLeituras = false;
      expect(
        (await disco.lerTudo()).keys,
        contains(CacheLocal.chaveNoArmazenamento('B', 'carteiras')),
      );
    });

    test(
      'encerrar a sessão invalida o vínculo que ainda estava lendo',
      () async {
        final vincularA = aberto.vincularA('A');
        final encerrar = aberto.vincularA(null);

        disco.liberarLeitura(1);
        await encerrar;
        disco.liberarLeitura(0);
        await vincularA;

        expect(aberto.dono, isNull);
        expect(aberto.ler('carteiras'), isNull);
      },
    );

    test('na ordem natural, o último vínculo continua valendo', () async {
      final vincularA = aberto.vincularA('A');
      final vincularB = aberto.vincularA('B');

      disco.liberarLeitura(0);
      await vincularA;
      disco.liberarLeitura(1);
      await vincularB;

      expect(aberto.ler('carteiras')!.dados, ['carteira de B']);
    });
  });
}
