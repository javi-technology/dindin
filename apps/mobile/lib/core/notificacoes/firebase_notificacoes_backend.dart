import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';

import 'notificacoes_backend.dart';

/// [NotificacoesBackend] sobre o Firebase Messaging (issue #408).
///
/// É a única parte do app que conhece o SDK de notificações, como
/// `FirebaseAuthBackend` é para a autenticação.
class FirebaseNotificacoesBackend implements NotificacoesBackend {
  FirebaseNotificacoesBackend({
    FirebaseMessaging? messaging,
    String? plataforma,
  }) : _messaging = messaging ?? FirebaseMessaging.instance,
       _plataforma = plataforma ?? (Platform.isIOS ? 'ios' : 'android');

  final FirebaseMessaging _messaging;
  final String _plataforma;

  @override
  String get plataforma => _plataforma;

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
  Future<String?> token() async {
    if (_plataforma == 'ios' && await _messaging.getAPNSToken() == null) {
      return null;
    }
    return _messaging.getToken();
  }

  @override
  Stream<String> get tokensRenovados => _messaging.onTokenRefresh;

  @override
  Future<void> apagarToken() => _messaging.deleteToken();
}
