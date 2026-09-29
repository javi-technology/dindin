import 'dart:async';

import 'package:dindin_mobile/core/notificacoes/notificacoes_backend.dart';

/// [NotificacoesBackend] de teste.
///
/// Os campos são ajustados um a um em vez de pelo construtor: vários testes
/// mudam a permissão depois de montar o falso.
class NotificacoesBackendFalso implements NotificacoesBackend {
  PermissaoDeNotificacao permissao = PermissaoDeNotificacao.naoPerguntada;

  /// O que a folha do sistema devolve.
  ///
  /// Separado de [permissao] porque são momentos diferentes: antes de pedir,
  /// o estado é "não perguntada" — é exatamente isso que faz o convite
  /// aparecer na tela.
  PermissaoDeNotificacao? respostaAoPedir;

  String? tokenDoAparelho = 'token-1';

  int pedidos = 0;
  final _renovacoes = StreamController<String>.broadcast();

  @override
  Future<PermissaoDeNotificacao> permissaoAtual() async => permissao;

  @override
  Future<PermissaoDeNotificacao> pedirPermissao() async {
    pedidos++;
    permissao = respostaAoPedir ?? permissao;
    return permissao;
  }

  @override
  Future<String?> token() async => tokenDoAparelho;

  @override
  Stream<String> get tokensRenovados => _renovacoes.stream;

  void renovar(String token) => _renovacoes.add(token);

  @override
  String get plataforma => 'android';

  // O FCM gera um token novo na solicitação seguinte ao `deleteToken`; o
  // falso reproduz isso, ou religar as notificações nunca registraria nada.
  @override
  Future<void> apagarToken() async {
    tokenDoAparelho = 'token-novo';
  }

  Future<void> fechar() => _renovacoes.close();
}
