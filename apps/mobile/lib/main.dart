import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/firebase_auth_backend.dart';
import 'core/data/cache_local.dart';
import 'core/data/dindin_api.dart';
import 'core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A configuração vem dos arquivos nativos — `google-services.json` no
  // Android e `GoogleService-Info.plist` no iOS —, que não são versionados
  // por trazerem chave de API. Ver `docs/mobile-firebase.md`.
  await Firebase.initializeApp();

  // O tema e o cache são lidos antes do primeiro quadro: subir no claro e
  // trocar depois faria a tela piscar a cada abertura para quem escolheu o
  // escuro, e sem o cache em mãos a primeira tela apareceria vazia mesmo
  // tendo o que mostrar.
  final tema = await ThemeController.carregar();
  final cache = await CacheLocal.abrir();

  final auth = AuthService(FirebaseAuthBackend());
  final api = DinDinApi(ApiClient(baseUrl: apiBaseUrl, tokenProvider: auth));

  runApp(DinDinApp(auth: auth, tema: tema, api: api, cache: cache));
}
