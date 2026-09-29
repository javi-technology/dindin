import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dindin_mobile/core/notificacoes/firebase_notificacoes_backend.dart';

class _FirebaseMessagingFalso extends Mock implements FirebaseMessaging {}

void main() {
  late _FirebaseMessagingFalso messaging;

  setUp(() => messaging = _FirebaseMessagingFalso());

  test('iOS não pede token FCM antes de receber o token APNs', () async {
    when(() => messaging.getAPNSToken()).thenAnswer((_) async => null);
    final backend = FirebaseNotificacoesBackend(
      messaging: messaging,
      plataforma: 'ios',
    );

    expect(await backend.token(), isNull);
    verify(() => messaging.getAPNSToken()).called(1);
    verifyNever(() => messaging.getToken());
  });

  test('iOS pede token FCM depois de receber o token APNs', () async {
    when(() => messaging.getAPNSToken()).thenAnswer((_) async => 'apns');
    when(() => messaging.getToken()).thenAnswer((_) async => 'fcm');
    final backend = FirebaseNotificacoesBackend(
      messaging: messaging,
      plataforma: 'ios',
    );

    expect(await backend.token(), 'fcm');
    verify(() => messaging.getToken()).called(1);
  });

  test('Android pede token FCM sem consultar APNs', () async {
    when(() => messaging.getToken()).thenAnswer((_) async => 'fcm');
    final backend = FirebaseNotificacoesBackend(
      messaging: messaging,
      plataforma: 'android',
    );

    expect(await backend.token(), 'fcm');
    verifyNever(() => messaging.getAPNSToken());
  });
}
