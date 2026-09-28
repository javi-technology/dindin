/// O que o usuário respondeu à permissão de notificação.
///
/// Negar é estado **normal**, não erro: as duas plataformas exigem permissão
/// explícita, e quem recusa continua recebendo o alerta por e-mail.
enum PermissaoDeNotificacao { naoPerguntada, concedida, negada }

/// Fronteira entre o app e o Firebase Messaging (issue #408).
///
/// Toda a conversa com o SDK passa por aqui, como em `AuthBackend`: é o que
/// permite testar o fluxo de permissão e de token sem rede nem aparelho.
abstract class NotificacoesBackend {
  Future<PermissaoDeNotificacao> permissaoAtual();

  /// Abre a folha do sistema pedindo a permissão.
  Future<PermissaoDeNotificacao> pedirPermissao();

  /// Token deste aparelho, ou `null` quando não há um.
  Future<String?> token();

  /// O token muda quando o usuário reinstala o app, troca de aparelho ou
  /// limpa os dados; sem reenviar, o alerta deixa de chegar sem aviso.
  Stream<String> get tokensRenovados;

  /// `android` ou `ios`, como o backend os nomeia.
  String get plataforma;

  Future<void> apagarToken();
}
