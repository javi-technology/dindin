import 'auth_backend.dart';
import 'auth_exception.dart';
import 'sessao.dart';
import 'token_provider.dart';

/// Autenticação do app, como o produto a enxerga.
///
/// Guarda as duas regras que não são do SDK: a sessão persiste entre
/// aberturas — perdê-la a cada abertura inviabiliza o uso no celular — e
/// falha de login vira texto em português, porque essa mensagem chega à tela.
class AuthService implements TokenProvider {
  AuthService(this._backend);

  final AuthBackend _backend;

  /// Sessão corrente a cada mudança; a primeira é a restaurada do disco.
  Stream<Sessao?> get sessoes => _backend.sessoes;

  Sessao? get sessaoAtual => _backend.sessaoAtual;

  Future<void> entrarComEmail(String email, String senha) =>
      _traduzindoErros(() => _backend.entrarComEmail(email, senha));

  Future<void> cadastrarComEmail(String email, String senha) =>
      _traduzindoErros(() => _backend.cadastrarComEmail(email, senha));

  Future<void> entrarComGoogle() =>
      _traduzindoErros(() => _backend.entrarComGoogle());

  Future<void> sair() => _backend.sair();

  @override
  Future<String?> idToken({bool forceRefresh = false}) =>
      _backend.idToken(forceRefresh: forceRefresh);

  Future<void> _traduzindoErros(Future<void> Function() acao) async {
    try {
      await acao();
    } on CodigoDeAuth catch (erro) {
      throw _traduzir(erro);
    }
  }

  /// Mensagens por código do Firebase.
  ///
  /// O código desconhecido cai numa mensagem genérica de propósito: repassar
  /// `xpto` para a tela não ajuda o usuário e ainda revela detalhe interno.
  /// O código original segue em `AuthException.code`, para o log.
  static const _mensagens = <String, String>{
    'invalid-credential': 'E-mail ou senha inválidos.',
    'wrong-password': 'E-mail ou senha inválidos.',
    'user-not-found': 'E-mail ou senha inválidos.',
    'invalid-email': 'E-mail inválido.',
    'user-disabled': 'Esta conta está desativada.',
    'email-already-in-use': 'Já existe uma conta com este e-mail.',
    'weak-password': 'A senha precisa ter ao menos 6 caracteres.',
    'network-request-failed':
        'Sem conexão. Verifique a internet e tente de novo.',
    'too-many-requests': 'Muitas tentativas. Tente de novo em alguns minutos.',
    'account-exists-with-different-credential': 'Já existe uma conta com este e-mail, criada por outro método de login.',
  };

  /// Códigos que significam desistência do usuário, não falha.
  static const _cancelamentos = {
    'cancelado-pelo-usuario',
    'sign_in_canceled',
    'web-context-canceled',
    'popup-closed-by-user',
  };

  AuthException _traduzir(CodigoDeAuth erro) {
    if (_cancelamentos.contains(erro.code)) {
      return const LoginCanceladoException();
    }

    return AuthException(
      _mensagens[erro.code] ?? 'Não foi possível entrar. Tente de novo.',
      code: erro.code,
    );
  }
}
