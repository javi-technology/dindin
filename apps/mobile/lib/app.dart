import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/auth/auth_gate.dart';
import 'core/auth/auth_service.dart';
import 'core/theme/dindin_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'shared/components/seletor_tema.dart';

/// Raiz do aplicativo.
///
/// As telas de dados chegam na #402; aqui ficam as decisões que valem para o
/// app todo — nome, locale, tema e quem decide entre login e app.
class DinDinApp extends StatelessWidget {
  const DinDinApp({super.key, required this.auth, required this.tema});

  final AuthService auth;
  final ThemeController tema;

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
        // `ThemeMode.system` é o padrão, e o celular é usado no escuro com
        // muito mais frequência que o desktop.
        themeMode: tema.modo,
        home: AuthGate(
          sessoes: auth.sessoes,
          login: LoginScreen(
            aoEntrarComEmail: auth.entrarComEmail,
            aoEntrarComGoogle: auth.entrarComGoogle,
            aoCadastrar: auth.cadastrarComEmail,
          ),
          autenticado: _Inicio(auth: auth, tema: tema),
        ),
      ),
    );
  }
}

/// Provisório: as telas de dados são a issue #402.
class _Inicio extends StatelessWidget {
  const _Inicio({required this.auth, required this.tema});

  final AuthService auth;
  final ThemeController tema;

  @override
  Widget build(BuildContext context) {
    // Criado aqui só para não ficar sem uso até a #402; a injeção própria
    // chega com as telas que de fato consomem a API.
    ApiClient(baseUrl: apiBaseUrl, tokenProvider: auth);

    return Scaffold(
      appBar: AppBar(
        title: const Text('DinDin'),
        actions: [
          IconButton(
            key: const Key('botao-sair'),
            onPressed: auth.sair,
            icon: const Icon(Icons.logout),
            tooltip: 'Sair',
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Em construção'),
              const SizedBox(height: 24),
              SeletorTema(controller: tema),
            ],
          ),
        ),
      ),
    );
  }
}
