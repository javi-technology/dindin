/// Onde o cache guarda os pares chave/valor (issue #498).
///
/// Fronteira entre o cache e o sistema: o `CacheLocal` carrega as regras de
/// produto (de quem é o dado, quando apagar), e quem implementa esta interface
/// carrega a plataforma. É o que permite testar essas regras sem Keychain nem
/// Keystore, que não existem fora do aparelho.
abstract class ArmazenamentoDoCache {
  /// Tudo o que está guardado, de uma vez: o cache lê ao vincular o usuário e
  /// serve as consultas da memória, para `ler` continuar síncrono.
  Future<Map<String, String>> lerTudo();

  Future<void> gravar(String chave, String valor);

  Future<void> remover(String chave);
}
