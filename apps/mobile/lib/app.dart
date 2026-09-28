import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/auth/auth_gate.dart';
import 'core/auth/auth_service.dart';
import 'features/auth/login_screen.dart';

/// Raiz do aplicativo.
///
/// O tema e os componentes comuns chegam na #401 e as telas de dados na
/// #402; aqui ficam as decisões que valem para o app todo — nome, locale e
/// quem decide entre login e app.
class DinDinApp extends StatelessWidget {
  const DinDinApp({super.key, required this.auth});

  final AuthService auth;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DinDin',
      // O produto é brasileiro e formata valor, percentual e data em pt-BR.
      // Fixar o locale evita que o app siga o idioma do aparelho e exiba
      // ponto decimal onde o usuário espera vírgula.
      locale: const Locale('pt', 'BR'),
      debugShowCheckedModeBanner: false,
      home: AuthGate(
        sessoes: auth.sessoes,
        login: LoginScreen(
          aoEntrarComEmail: auth.entrarComEmail,
          aoEntrarComGoogle: auth.entrarComGoogle,
          aoCadastrar: auth.cadastrarComEmail,
        ),
        autenticado: _Inicio(auth: auth),
      ),
    );
  }
}

/// Provisório: as telas de dados são a issue #402.
class _Inicio extends StatelessWidget {
  const _Inicio({required this.auth});

  final AuthService auth;

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
      body: const Center(child: Text('Em construção')),
    );
  }
}
