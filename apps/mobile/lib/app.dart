import 'package:flutter/material.dart';

import 'core/auth/auth_gate.dart';
import 'core/auth/auth_service.dart';
import 'core/data/cache_local.dart';
import 'core/data/dindin_api.dart';
import 'core/theme/dindin_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/inicio/inicio_screen.dart';

/// Raiz do aplicativo.
class DinDinApp extends StatelessWidget {
  const DinDinApp({
    super.key,
    required this.auth,
    required this.tema,
    required this.api,
    required this.cache,
  });

  final AuthService auth;
  final ThemeController tema;
  final DinDinApi api;
  final CacheLocal cache;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: tema,
      builder: (context, _) => MaterialApp(
        title: 'DinDin',
        // O produto é brasileiro e formata valor, percentual e data em pt-BR.
        // Fixar o locale evita que o app siga o idioma do aparelho e exiba
        // ponto decimal onde o usuário espera vírgula.
        locale: const Locale('pt', 'BR'),
        debugShowCheckedModeBanner: false,
        theme: DinDinTheme.claro,
        darkTheme: DinDinTheme.escuro,
        // O padrão é a preferência do sistema, e o celular é usado no escuro
        // com muito mais frequência que o desktop.
        themeMode: tema.modo,
        home: AuthGate(
          sessoes: auth.sessoes,
          login: LoginScreen(
            aoEntrarComEmail: auth.entrarComEmail,
            aoEntrarComGoogle: auth.entrarComGoogle,
            aoCadastrar: auth.cadastrarComEmail,
          ),
          autenticado: InicioScreen(
            auth: auth,
            api: api,
            cache: cache,
            tema: tema,
          ),
        ),
      ),
    );
  }
}
