import 'dart:async';

import 'package:dindin_mobile/core/data/armazenamento_do_cache.dart';

/// [ArmazenamentoDoCache] de teste: o armazenamento seguro do sistema não
/// existe fora do aparelho.
class ArmazenamentoEmMemoria implements ArmazenamentoDoCache {
  final Map<String, String> _valores = {};

  /// Simula o armazenamento recusando a gravação (Keychain bloqueado, disco
  /// cheio).
  bool falharAoGravar = false;

  /// Segura as leituras até o teste liberá-las: simula o sistema respondendo
  /// fora de ordem, que é o que `vincularA` precisa suportar quando a sessão
  /// muda mais depressa do que o armazenamento responde.
  bool segurarLeituras = false;

  final List<(Map<String, String>, Completer<Map<String, String>>)> _retidas =
      [];

  /// Quantas leituras estão retidas à espera de [liberarLeitura].
  int get leiturasRetidas => _retidas.length;

  /// Libera a leitura de índice [indice], na ordem em que foram pedidas. O
  /// conteúdo entregue é o de quando ela foi **pedida**, como numa leitura
  /// que demorou a voltar.
  void liberarLeitura(int indice) {
    final (instantaneo, completer) = _retidas[indice];
    completer.complete(instantaneo);
  }

  @override
  Future<Map<String, String>> lerTudo() {
    final instantaneo = Map.of(_valores);
    if (!segurarLeituras) return Future.value(instantaneo);

    final completer = Completer<Map<String, String>>();
    _retidas.add((instantaneo, completer));
    return completer.future;
  }

  @override
  Future<void> gravar(String chave, String valor) async {
    if (falharAoGravar) throw StateError('armazenamento indisponível');
    _valores[chave] = valor;
  }

  @override
  Future<void> remover(String chave) async => _valores.remove(chave);
}
