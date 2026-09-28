import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/firebase_auth_backend.dart';
import 'core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A configuração vem dos arquivos nativos — `google-services.json` no
  // Android e `GoogleService-Info.plist` no iOS —, que não são versionados
  // por trazerem chave de API. Ver `docs/mobile-firebase.md`.
  await Firebase.initializeApp();

  // O tema é lido antes do primeiro quadro: subir no claro e trocar depois
  // faria a tela piscar a cada abertura para quem escolheu o escuro — o
  // mesmo cuidado que o `index.html` da web toma antes da primeira pintura.
  final tema = await ThemeController.carregar();

  runApp(DinDinApp(auth: AuthService(FirebaseAuthBackend()), tema: tema));
}
