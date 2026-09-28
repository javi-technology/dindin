/// Quem sabe entregar o ID token da sessão corrente.
///
/// Existe separado de `AuthService` para o cliente HTTP não depender de todo
/// o fluxo de login: ele só precisa de um token e de um jeito de pedir outro
/// quando o que tinha venceu.
abstract class TokenProvider {
  /// Token atual, ou `null` sem sessão.
  ///
  /// Com [forceRefresh], ignora o token em cache e pede um novo ao provedor.
  Future<String?> idToken({bool forceRefresh = false});
}
