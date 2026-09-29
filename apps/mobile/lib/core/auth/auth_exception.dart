/// Erro de autenticação já traduzido para a tela.
///
/// As mensagens ficam em português porque chegam ao usuário: o código cru do
/// Firebase (`invalid-credential`, `user-not-found`) não diz a ninguém o que
/// fazer a seguir.
class AuthException implements Exception {
  const AuthException(this.message, {this.code});

  final String message;

  /// Código original do provedor, para o log — nunca para a tela.
  final String? code;

  @override
  String toString() => 'AuthException($message)';
}

/// O usuário fechou a folha do Google antes de escolher a conta.
///
/// É um caso normal, não uma falha: a tela não deve mostrar erro vermelho
/// para quem simplesmente desistiu.
class LoginCanceladoException extends AuthException {
  const LoginCanceladoException() : super('Login cancelado.');
}

/// Erro do provedor identificado por código, como o Firebase o relata.
class CodigoDeAuth implements Exception {
  const CodigoDeAuth(this.code, {this.message});

  final String code;
  final String? message;

  @override
  String toString() => 'CodigoDeAuth($code)';
}
