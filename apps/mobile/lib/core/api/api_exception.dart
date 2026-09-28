/// Falha relatada pela API.
///
/// A mensagem vem do corpo porque a API escreve os 4xx em português
/// justamente para chegarem à tela; inventar um texto genérico no lugar
/// esconderia do usuário o que ele precisa corrigir.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
  });

  final int statusCode;
  final String message;

  /// Código de contrato lido pelo app, como `SUBSCRIPTION_REQUIRED`.
  final String? code;

  @override
  String toString() => 'ApiException($statusCode: $message)';
}

/// 401 que sobreviveu à renovação do token: a sessão acabou de verdade.
class UnauthorizedException extends ApiException {
  const UnauthorizedException({String? message, super.code})
    : super(
        statusCode: 401,
        message: message ?? 'Sua sessão expirou. Entre de novo.',
      );
}

/// A requisição não chegou à API.
///
/// Distinta de [ApiException] porque o caminho de recuperação é outro: aqui
/// cabe "tentar de novo", e no celular isso é rotina, não exceção.
class NetworkException implements Exception {
  const NetworkException([this.causa]);

  final Object? causa;

  String get message => 'Sem conexão com o servidor. Tente de novo.';

  @override
  String toString() => 'NetworkException($causa)';
}
