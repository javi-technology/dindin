import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'armazenamento_do_cache.dart';

/// Cache no armazenamento seguro do sistema: Keychain no iOS e Keystore no
/// Android (issue #498).
///
/// O cache guarda patrimônio, carteiras e proventos. As preferências do sistema
/// os deixariam em texto puro, legíveis por backup do aparelho e por quem
/// tivesse acesso ao arquivo; aqui o conteúdo é cifrado com chave que não sai
/// do hardware seguro.
class ArmazenamentoSeguro implements ArmazenamentoDoCache {
  ArmazenamentoSeguro([FlutterSecureStorage? armazenamento])
    : _armazenamento =
          armazenamento ??
          const FlutterSecureStorage(
            // O item não migra para outro aparelho nem entra em backup: o
            // cache é conveniência, e refazê-lo custa uma espera.
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  final FlutterSecureStorage _armazenamento;

  @override
  Future<Map<String, String>> lerTudo() => _armazenamento.readAll();

  @override
  Future<void> gravar(String chave, String valor) =>
      _armazenamento.write(key: chave, value: valor);

  @override
  Future<void> remover(String chave) => _armazenamento.delete(key: chave);
}
