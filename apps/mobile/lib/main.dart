import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/firebase_auth_backend.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A configuração vem dos arquivos nativos — `google-services.json` no
  // Android e `GoogleService-Info.plist` no iOS —, que não são versionados
  // por trazerem chave de API. Ver `docs/mobile-firebase.md`.
  await Firebase.initializeApp();

  runApp(DinDinApp(auth: AuthService(FirebaseAuthBackend())));
}
