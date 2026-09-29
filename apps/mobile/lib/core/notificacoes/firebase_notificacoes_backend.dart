import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';

import 'notificacoes_backend.dart';

/// [NotificacoesBackend] sobre o Firebase Messaging (issue #408).
///
/// É a única parte do app que conhece o SDK de notificações, como
/// `FirebaseAuthBackend` é para a autenticação.
class FirebaseNotificacoesBackend implements NotificacoesBackend {
  FirebaseNotificacoesBackend({FirebaseMessaging? messaging})
    : _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseMessaging _messaging;

  @override
  String get plataforma => Platform.isIOS ? 'ios' : 'android';

  @override
  Future<PermissaoDeNotificacao> permissaoAtual() async =>
      _converter(await _messaging.getNotificationSettings());

  @override
  Future<PermissaoDeNotificacao> pedirPermissao() async =>
      _converter(await _messaging.requestPermission());

  PermissaoDeNotificacao _converter(NotificationSettings ajustes) =>
      switch (ajustes.authorizationStatus) {
        AuthorizationStatus.authorized ||
        AuthorizationStatus.provisional => PermissaoDeNotificacao.concedida,
        AuthorizationStatus.denied => PermissaoDeNotificacao.negada,
        _ => PermissaoDeNotificacao.naoPerguntada,
      };

  @override
  Future<String?> token() => _messaging.getToken();

  @override
  Stream<String> get tokensRenovados => _messaging.onTokenRefresh;

  @override
  Future<void> apagarToken() => _messaging.deleteToken();
}
