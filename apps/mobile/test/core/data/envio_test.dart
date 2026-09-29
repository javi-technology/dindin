import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:dindin_mobile/core/api/api_exception.dart';
import 'package:dindin_mobile/core/data/envio.dart';

// ---------------------------------------------------------------------------
// Envio de uma operação de escrita (issue #403).
//
// Escrita no celular falha de formas que a web quase não vê: a rede cai no
// meio do envio e o usuário toca no botão duas vezes achando que não
// funcionou. Sem tratamento, isso vira posição duplicada — que é erro de dado
// financeiro, não incômodo de interface.
// ---------------------------------------------------------------------------
void main() {
  test('começa parado', () {
    final envio = Envio();

    expect(envio.enviando, isFalse);
    expect(envio.erro, isNull);
  });

  test('marca que está enviando e volta ao fim', () async {
    final envio = Envio();
    final resposta = Completer<void>();

    final emAndamento = envio.executar(() => resposta.future);
    expect(envio.enviando, isTrue);

    resposta.complete();
    await emAndamento;

    expect(envio.enviando, isFalse);
  });

  test('avisa quem observa', () async {
    final envio = Envio();
    var avisos = 0;
    envio.addListener(() => avisos++);

    await envio.executar(() async {});

    expect(avisos, greaterThanOrEqualTo(2));
  });

  // O caso do toque duplo: a segunda chamada é recusada enquanto a primeira
  // não respondeu, e não vira um segundo registro.
  test('recusa o segundo envio enquanto o primeiro não respondeu', () async {
    final envio = Envio();
    final resposta = Completer<void>();
    var execucoes = 0;

    final primeiro = envio.executar(() {
      execucoes++;
      return resposta.future;
    });
    final segundo = envio.executar(() async => execucoes++);

    expect(await segundo, isFalse);
    expect(execucoes, 1);

    resposta.complete();
    expect(await primeiro, isTrue);
  });

  test('aceita um novo envio depois do primeiro terminar', () async {
    final envio = Envio();
    var execucoes = 0;

    await envio.executar(() async => execucoes++);
    await envio.executar(() async => execucoes++);

    expect(execucoes, 2);
  });

  group('falha', () {
    test('devolve false e guarda a mensagem da API', () async {
      final envio = Envio();

      final deuCerto = await envio.executar(
        () async => throw const ApiException(
          statusCode: 400,
          message: 'Ticker não está no catálogo',
        ),
      );

      expect(deuCerto, isFalse);
      expect(envio.erro, 'Ticker não está no catálogo');
    });

    test('falha de rede vira mensagem com caminho de recuperação', () async {
      final envio = Envio();

      await envio.executar(() async => throw const NetworkException());

      expect(envio.erro, contains('Tente de novo'));
    });

    // Perder o formulário preenchido numa falha de rede obriga o usuário a
    // digitar tudo de novo — no celular, justamente onde digitar custa mais.
    test('o envio volta a ficar disponível depois do erro', () async {
      final envio = Envio();
      await envio.executar(() async => throw const NetworkException());

      expect(envio.enviando, isFalse);

      final deuCerto = await envio.executar(() async {});

      expect(deuCerto, isTrue);
      expect(envio.erro, isNull);
    });

    test('erro desconhecido não vaza detalhe interno', () async {
      final envio = Envio();

      await envio.executar(() async => throw StateError('interno'));

      expect(envio.erro, isNot(contains('interno')));
    });
  });
}
