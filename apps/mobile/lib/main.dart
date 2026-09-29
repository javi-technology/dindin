import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/firebase_auth_backend.dart';
import 'core/data/cache_local.dart';
import 'core/data/dindin_api.dart';
import 'core/assinatura/assinatura_service.dart';
import 'core/setup/setup_service.dart';
import 'core/notificacoes/firebase_notificacoes_backend.dart';
import 'core/notificacoes/notificacoes_service.dart';
import 'core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A configuração vem dos arquivos nativos — `google-services.json` no
  // Android e `GoogleService-Info.plist` no iOS —, que não são versionados
  // por trazerem chave de API. Ver `docs/mobile-firebase.md`.
  await Firebase.initializeApp();

  // API e Auth precisam apontar para o mesmo projeto local: um token emitido
  // pelo Auth de produção não é aceito pelo Functions emulator. A flag só é
  // definida em desenvolvimento, portanto builds publicados continuam usando
  // a infraestrutura Firebase real.
  if (firebaseEmulatorHost.isNotEmpty) {
    await FirebaseAuth.instance.useAuthEmulator(firebaseEmulatorHost, 9099);
  }

  // O tema e o cache são lidos antes do primeiro quadro: subir no claro e
  // trocar depois faria a tela piscar a cada abertura para quem escolheu o
  // escuro, e sem o cache em mãos a primeira tela apareceria vazia mesmo
  // tendo o que mostrar.
  final tema = await ThemeController.carregar();
  final cache = await CacheLocal.abrir();

  final auth = AuthService(FirebaseAuthBackend());
  final api = DinDinApi(ApiClient(baseUrl: apiBaseUrl, tokenProvider: auth));

  final notificacoes = await NotificacoesService.carregar(
    backend: FirebaseNotificacoesBackend(),
    registrarToken: api.registrarTokenDeNotificacao,
    removerToken: api.removerTokenDeNotificacao,
  );

  // O app pode ter subido por um toque na notificação: nesse caso ele abre
  // direto na geladeira do alerta, e não na tela inicial — o usuário tocou
  // por causa de um ativo específico.
  final inicial = await FirebaseMessaging.instance.getInitialMessage();

  runApp(
    DinDinApp(
      auth: auth,
      tema: tema,
      api: api,
      cache: cache,
      notificacoes: notificacoes,
      setup: SetupService(api),
      assinatura: AssinaturaService(api),
      geladeiraInicial: inicial?.data['fridgeId'] as String?,
    ),
  );
}
