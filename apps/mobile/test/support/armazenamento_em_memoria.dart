import 'package:dindin_mobile/core/data/armazenamento_do_cache.dart';

/// [ArmazenamentoDoCache] de teste: o armazenamento seguro do sistema não
/// existe fora do aparelho.
class ArmazenamentoEmMemoria implements ArmazenamentoDoCache {
  final Map<String, String> _valores = {};

  /// Simula o armazenamento recusando a gravação (Keychain bloqueado, disco
  /// cheio).
  bool falharAoGravar = false;

  @override
  Future<Map<String, String>> lerTudo() async => Map.of(_valores);

  @override
  Future<void> gravar(String chave, String valor) async {
    if (falharAoGravar) throw StateError('armazenamento indisponível');
    _valores[chave] = valor;
  }

  @override
  Future<void> remover(String chave) async => _valores.remove(chave);
}
