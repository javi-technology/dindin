import 'sessao.dart';

/// Fronteira entre o app e o Firebase Auth.
///
/// Toda a conversa com o SDK passa por aqui, e é o que permite testar o
/// fluxo de login sem rede nem emulador: [AuthService] carrega as regras de
/// produto, esta interface carrega a plataforma.
///
/// As implementações relatam falha lançando `CodigoDeAuth`, com o código do
/// provedor; traduzir para a tela é trabalho do serviço.
abstract class AuthBackend {
  /// Sessão corrente a cada mudança, começando pela restaurada do disco.
  Stream<Sessao?> get sessoes;

  /// Última sessão conhecida, sem esperar o stream.
  Sessao? get sessaoAtual;

  Future<void> entrarComEmail(String email, String senha);

  Future<void> cadastrarComEmail(String email, String senha);

  /// Login com Google pelo fluxo nativo da plataforma.
  ///
  /// O web usa `signInWithPopup`, que é de navegador e não existe no celular.
  Future<void> entrarComGoogle();

  Future<void> sair();

  Future<String?> idToken({bool forceRefresh = false});
}
